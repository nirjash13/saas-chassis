package metering

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"
)

// Flusher drains Redis metering hashes into PostgreSQL every 5 minutes.
//
// Redis key format written by MeteringMiddleware:
//   meter:<tenantID>:<YYYY-MM-DD>  (Hash)
//
// Relevant hash fields:
//   endpoint:<METHOD>:<path>  → request count for that endpoint
//
// One gateway.api_requests row is inserted per (tenant, date, endpoint, method).
// status_code is stored as 0 (aggregate); plan is stored as "unknown" because the
// middleware does not write the plan into the metering hash.
type Flusher struct {
	db     *pgxpool.Pool
	redis  *redis.Client
	logger zerolog.Logger
}

// NewFlusher constructs a Flusher.
func NewFlusher(db *pgxpool.Pool, rdb *redis.Client, logger zerolog.Logger) *Flusher {
	return &Flusher{db: db, redis: rdb, logger: logger}
}

// Start runs the flush loop every 5 minutes until ctx is cancelled.
func (f *Flusher) Start(ctx context.Context) {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := f.Flush(ctx); err != nil {
				f.logger.Error().Err(err).Msg("metering flush failed")
			}
		}
	}
}

type meterRow struct {
	tenantID   string
	plan       string
	endpoint   string
	method     string
	statusCode int
	count      int64
	requestAt  time.Time
}

// Flush scans all meter:* keys from Redis, parses endpoint fields, and bulk-inserts
// into gateway.api_requests. Keys are deleted from Redis after successful insert.
func (f *Flusher) Flush(ctx context.Context) error {
	keys, err := f.scanMeterKeys(ctx)
	if err != nil {
		return err
	}
	if len(keys) == 0 {
		return nil
	}

	var rows []meterRow
	var flushedKeys []string

	for _, key := range keys {
		// key format: meter:<tenantID>:<YYYY-MM-DD>
		parts := strings.SplitN(key, ":", 3)
		if len(parts) != 3 {
			f.logger.Warn().Str("key", key).Msg("unexpected metering key format, skipping")
			continue
		}
		tenantID := parts[1]
		dateStr := parts[2]

		requestAt, err := time.Parse("2006-01-02", dateStr)
		if err != nil {
			f.logger.Warn().Str("key", key).Str("date", dateStr).Msg("cannot parse date in metering key, skipping")
			continue
		}

		fields, err := f.redis.HGetAll(ctx, key).Result()
		if err != nil {
			f.logger.Error().Err(err).Str("key", key).Msg("HGetAll failed, skipping key")
			continue
		}

		keyHasRows := false
		for field, val := range fields {
			// Only process endpoint fields: endpoint:<METHOD>:<path>
			if !strings.HasPrefix(field, "endpoint:") {
				continue
			}
			// field = "endpoint:<METHOD>:<path>"
			endpointParts := strings.SplitN(field, ":", 3)
			if len(endpointParts) != 3 {
				continue
			}
			method := endpointParts[1]
			path := endpointParts[2]

			count := int64(0)
			if _, err := fmt.Sscanf(val, "%d", &count); err != nil || count <= 0 {
				continue
			}

			rows = append(rows, meterRow{
				tenantID:   tenantID,
				plan:       "unknown",
				endpoint:   path,
				method:     method,
				statusCode: 0,
				count:      count,
				requestAt:  requestAt,
			})
			keyHasRows = true
		}

		if keyHasRows {
			flushedKeys = append(flushedKeys, key)
		}
	}

	if len(rows) == 0 {
		return nil
	}

	if err := f.bulkInsert(ctx, rows); err != nil {
		return fmt.Errorf("bulk insert: %w", err)
	}

	// Delete flushed keys from Redis only after successful DB write.
	if len(flushedKeys) > 0 {
		if err := f.redis.Del(ctx, flushedKeys...).Err(); err != nil {
			f.logger.Warn().Err(err).Msg("failed to delete flushed metering keys from Redis")
		}
	}

	f.logger.Info().
		Int("keys", len(flushedKeys)).
		Int("rows", len(rows)).
		Msg("metering flush complete")

	return nil
}

func (f *Flusher) scanMeterKeys(ctx context.Context) ([]string, error) {
	var keys []string
	cursor := uint64(0)
	for {
		batch, next, err := f.redis.Scan(ctx, cursor, "meter:*", 100).Result()
		if err != nil {
			return nil, fmt.Errorf("redis scan: %w", err)
		}
		keys = append(keys, batch...)
		cursor = next
		if cursor == 0 {
			break
		}
	}
	return keys, nil
}

func (f *Flusher) bulkInsert(ctx context.Context, rows []meterRow) error {
	// Build parameterised bulk INSERT.
	// Each row expands to 6 placeholders:
	// (tenant_id, plan, endpoint, method, status_code, request_at)
	placeholders := make([]string, 0, len(rows))
	args := make([]interface{}, 0, len(rows)*6)
	for i, r := range rows {
		n := i * 6
		placeholders = append(placeholders,
			fmt.Sprintf("($%d,$%d,$%d,$%d,$%d,$%d)", n+1, n+2, n+3, n+4, n+5, n+6),
		)
		args = append(args, r.tenantID, r.plan, r.endpoint, r.method, r.statusCode, r.requestAt)
	}

	query := "INSERT INTO gateway.api_requests(tenant_id,plan,endpoint,method,status_code,request_at) VALUES " +
		strings.Join(placeholders, ",")

	_, err := f.db.Exec(ctx, query, args...)
	return err
}
