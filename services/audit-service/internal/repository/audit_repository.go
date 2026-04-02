package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog"
	"github.com/your-org/saas-chassis/audit-service/internal/model"
)

// AuditEvent is the shape received from RabbitMQ.
type AuditEvent struct {
	TenantID     string          `json:"tenantId"`
	UserID       string          `json:"userId,omitempty"`
	Action       string          `json:"action"`
	ResourceType string          `json:"resourceType"`
	ResourceID   string          `json:"resourceId,omitempty"`
	Description  string          `json:"description,omitempty"`
	Changes      json.RawMessage `json:"changes,omitempty"`
	Metadata     json.RawMessage `json:"metadata,omitempty"`
	IPAddress    string          `json:"ipAddress,omitempty"`
	UserAgent    string          `json:"userAgent,omitempty"`
	RequestID    string          `json:"requestId,omitempty"`
	ServiceName  string          `json:"serviceName"`
}

// QueryFilter holds parameters for listing audit entries.
type QueryFilter struct {
	TenantID     string
	UserID       string
	Action       string
	ResourceType string
	From         *time.Time
	To           *time.Time
	Page         int
	PageSize     int
}

// TenantContext carries the caller's auth identity for RLS.
type TenantContext struct {
	TenantID        string
	IsPlatformAdmin bool
}

// AuditRepository handles all audit DB operations.
type AuditRepository struct {
	pool   *pgxpool.Pool
	logger zerolog.Logger
}

func NewAuditRepository(pool *pgxpool.Pool, logger zerolog.Logger) *AuditRepository {
	return &AuditRepository{pool: pool, logger: logger}
}

// withRLS runs fn inside a transaction with app.current_tenant_id and app.is_platform_admin set.
func (r *AuditRepository) withRLS(ctx context.Context, tc TenantContext, fn func(tx pgx.Tx) error) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	if _, err := tx.Exec(ctx, "SET LOCAL app.current_tenant_id = $1", tc.TenantID); err != nil {
		return fmt.Errorf("set tenant id: %w", err)
	}
	if _, err := tx.Exec(ctx, "SET LOCAL app.is_platform_admin = $1",
		fmt.Sprintf("%t", tc.IsPlatformAdmin)); err != nil {
		return fmt.Errorf("set platform admin: %w", err)
	}

	if err := fn(tx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// BatchInsert stores multiple audit events. Uses pgx.Batch for throughput.
// INSERT policy is WITH CHECK (true), so no RLS context needed for writes.
func (r *AuditRepository) BatchInsert(ctx context.Context, events []AuditEvent) error {
	if len(events) == 0 {
		return nil
	}

	const insertSQL = `
		INSERT INTO audit.entries
			(tenant_id, user_id, action, resource_type, resource_id, description,
			 changes, metadata, ip_address, user_agent, service_name, request_id)
		VALUES
			($1::uuid, $2::uuid, $3::audit_action, $4, $5, $6,
			 $7::jsonb, $8::jsonb, $9::inet, $10, $11, $12::uuid)
	`

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	batch := &pgx.Batch{}

	for _, e := range events {
		if _, err := uuid.Parse(e.TenantID); err != nil {
			r.logger.Warn().Str("tenantId", e.TenantID).Msg("skipping event with invalid tenantId")
			continue
		}

		changes := nilableJSON(e.Changes)
		metadata := json.RawMessage("{}")
		if len(e.Metadata) > 0 {
			metadata = e.Metadata
		}

		batch.Queue(insertSQL,
			e.TenantID,
			nilIfEmpty(e.UserID),
			e.Action,
			e.ResourceType,
			nilIfEmpty(e.ResourceID),
			nilIfEmpty(e.Description),
			[]byte(changes),
			[]byte(metadata),
			nilIfEmpty(e.IPAddress),
			nilIfEmpty(e.UserAgent),
			nilIfEmpty(e.ServiceName),
			nilIfEmpty(e.RequestID),
		)
	}

	if batch.Len() == 0 {
		return nil
	}

	results := tx.SendBatch(ctx, batch)
	for i := 0; i < batch.Len(); i++ {
		if _, err := results.Exec(); err != nil {
			results.Close()
			return fmt.Errorf("batch exec [%d]: %w", i, err)
		}
	}
	if err := results.Close(); err != nil {
		return fmt.Errorf("close batch: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit: %w", err)
	}
	r.logger.Info().Int("count", batch.Len()).Msg("audit batch inserted")
	return nil
}

// QueryEntries returns paginated audit entries with RLS applied.
func (r *AuditRepository) QueryEntries(ctx context.Context, tc TenantContext, f QueryFilter) ([]model.AuditEntry, int64, error) {
	if f.Page < 1 {
		f.Page = 1
	}
	if f.PageSize < 1 || f.PageSize > 200 {
		f.PageSize = 50
	}

	where := []string{}
	args := []interface{}{}
	n := 1

	if !tc.IsPlatformAdmin {
		where = append(where, fmt.Sprintf("tenant_id = $%d::uuid", n))
		args = append(args, tc.TenantID)
		n++
	} else if f.TenantID != "" {
		where = append(where, fmt.Sprintf("tenant_id = $%d::uuid", n))
		args = append(args, f.TenantID)
		n++
	}
	if f.UserID != "" {
		where = append(where, fmt.Sprintf("user_id = $%d::uuid", n))
		args = append(args, f.UserID)
		n++
	}
	if f.Action != "" {
		where = append(where, fmt.Sprintf("action = $%d::audit_action", n))
		args = append(args, f.Action)
		n++
	}
	if f.ResourceType != "" {
		where = append(where, fmt.Sprintf("resource_type = $%d", n))
		args = append(args, f.ResourceType)
		n++
	}
	if f.From != nil {
		where = append(where, fmt.Sprintf("created_at >= $%d", n))
		args = append(args, *f.From)
		n++
	}
	if f.To != nil {
		where = append(where, fmt.Sprintf("created_at <= $%d", n))
		args = append(args, *f.To)
		n++
	}

	whereSQL := ""
	if len(where) > 0 {
		whereSQL = "WHERE " + strings.Join(where, " AND ")
	}

	var total int64
	entries := make([]model.AuditEntry, 0)

	err := r.withRLS(ctx, tc, func(tx pgx.Tx) error {
		countSQL := fmt.Sprintf("SELECT COUNT(*) FROM audit.entries %s", whereSQL)
		if err := tx.QueryRow(ctx, countSQL, args...).Scan(&total); err != nil {
			return fmt.Errorf("count: %w", err)
		}

		offset := (f.Page - 1) * f.PageSize
		pageArgs := append(append([]interface{}{}, args...), f.PageSize, offset)
		dataSQL := fmt.Sprintf(`
			SELECT id::text, tenant_id::text, user_id::text, action::text,
			       resource_type, resource_id, description,
			       changes::text, metadata::text,
			       ip_address::text, user_agent, request_id::text,
			       service_name, created_at
			FROM audit.entries %s
			ORDER BY created_at DESC
			LIMIT $%d OFFSET $%d
		`, whereSQL, n, n+1)

		rows, err := tx.Query(ctx, dataSQL, pageArgs...)
		if err != nil {
			return fmt.Errorf("query: %w", err)
		}
		defer rows.Close()

		for rows.Next() {
			e, err := scanEntry(rows)
			if err != nil {
				return fmt.Errorf("scan: %w", err)
			}
			entries = append(entries, e)
		}
		return rows.Err()
	})

	return entries, total, err
}

// FindByID returns a single audit entry filtered by RLS.
func (r *AuditRepository) FindByID(ctx context.Context, tc TenantContext, id string) (*model.AuditEntry, error) {
	var entry *model.AuditEntry

	err := r.withRLS(ctx, tc, func(tx pgx.Tx) error {
		const q = `
			SELECT id::text, tenant_id::text, user_id::text, action::text,
			       resource_type, resource_id, description,
			       changes::text, metadata::text,
			       ip_address::text, user_agent, request_id::text,
			       service_name, created_at
			FROM audit.entries WHERE id = $1::uuid
		`
		row := tx.QueryRow(ctx, q, id)
		e, err := scanEntry(row)
		if err != nil {
			return fmt.Errorf("find by id: %w", err)
		}
		entry = &e
		return nil
	})

	return entry, err
}

// GetSummary returns aggregated audit statistics. Caller must be platform admin.
func (r *AuditRepository) GetSummary(ctx context.Context) (*model.AuditSummary, error) {
	tc := TenantContext{IsPlatformAdmin: true}
	summary := &model.AuditSummary{
		ByAction:  make(map[string]int64),
		ByService: make(map[string]int64),
	}

	err := r.withRLS(ctx, tc, func(tx pgx.Tx) error {
		if err := tx.QueryRow(ctx,
			"SELECT COUNT(*) FROM audit.entries",
		).Scan(&summary.TotalEntries); err != nil {
			return fmt.Errorf("total: %w", err)
		}

		actionRows, err := tx.Query(ctx,
			"SELECT action::text, COUNT(*) FROM audit.entries GROUP BY action",
		)
		if err != nil {
			return fmt.Errorf("by action: %w", err)
		}
		defer actionRows.Close()
		for actionRows.Next() {
			var action string
			var count int64
			if err := actionRows.Scan(&action, &count); err != nil {
				return err
			}
			summary.ByAction[action] = count
		}
		if err := actionRows.Err(); err != nil {
			return err
		}

		svcRows, err := tx.Query(ctx, `
			SELECT service_name, COUNT(*)
			FROM audit.entries
			WHERE service_name IS NOT NULL
			GROUP BY service_name
		`)
		if err != nil {
			return fmt.Errorf("by service: %w", err)
		}
		defer svcRows.Close()
		for svcRows.Next() {
			var svc string
			var count int64
			if err := svcRows.Scan(&svc, &count); err != nil {
				return err
			}
			summary.ByService[svc] = count
		}
		if err := svcRows.Err(); err != nil {
			return err
		}

		return tx.QueryRow(ctx, `
			SELECT COUNT(*) FROM audit.entries
			WHERE created_at > NOW() - INTERVAL '24 hours'
		`).Scan(&summary.Last24Hours)
	})

	return summary, err
}

// UpsertServiceHealth updates the health status of a chassis service.
func (r *AuditRepository) UpsertServiceHealth(ctx context.Context, name, status string, responseMs int64) {
	if _, err := r.pool.Exec(ctx, `
		INSERT INTO audit.service_health (service_name, status, response_time_ms, checked_at)
		VALUES ($1, $2, $3, NOW())
		ON CONFLICT (service_name) DO UPDATE
		SET status = EXCLUDED.status,
		    response_time_ms = EXCLUDED.response_time_ms,
		    checked_at = NOW()
	`, name, status, responseMs); err != nil {
		r.logger.Error().Err(err).Str("service", name).Msg("failed to upsert service health")
	}
}

// GetServiceHealth returns the last known health status of all registered services.
func (r *AuditRepository) GetServiceHealth(ctx context.Context) ([]model.ServiceHealth, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id::text, service_name, status, response_time_ms, details::text, checked_at
		FROM audit.service_health
		ORDER BY service_name
	`)
	if err != nil {
		return nil, fmt.Errorf("query service health: %w", err)
	}
	defer rows.Close()

	results := make([]model.ServiceHealth, 0)
	for rows.Next() {
		var h model.ServiceHealth
		var idStr string
		var detailsStr *string

		if err := rows.Scan(&idStr, &h.ServiceName, &h.Status, &h.ResponseTimeMs,
			&detailsStr, &h.CheckedAt); err != nil {
			return nil, fmt.Errorf("scan: %w", err)
		}
		h.ID, _ = uuid.Parse(idStr)
		if detailsStr != nil {
			h.Details = json.RawMessage(*detailsStr)
		}
		results = append(results, h)
	}
	return results, rows.Err()
}

// scanEntry reads a single AuditEntry from a pgx Row or Rows scanner.
// Columns order: id, tenant_id, user_id, action, resource_type, resource_id,
// description, changes, metadata, ip_address, user_agent, request_id, service_name, created_at
func scanEntry(row interface {
	Scan(dest ...any) error
}) (model.AuditEntry, error) {
	var (
		e           model.AuditEntry
		idStr       string
		tenantStr   string
		userStr     *string
		actionStr   string
		changesStr  *string
		metaStr     *string
		requestStr  *string
	)

	if err := row.Scan(
		&idStr, &tenantStr, &userStr, &actionStr,
		&e.ResourceType, &e.ResourceID, &e.Description,
		&changesStr, &metaStr,
		&e.IPAddress, &e.UserAgent, &requestStr,
		&e.ServiceName, &e.CreatedAt,
	); err != nil {
		return e, err
	}

	e.ID, _ = uuid.Parse(idStr)
	e.TenantID, _ = uuid.Parse(tenantStr)
	e.Action = actionStr

	if userStr != nil {
		u, _ := uuid.Parse(*userStr)
		e.UserID = &u
	}
	if requestStr != nil {
		r, _ := uuid.Parse(*requestStr)
		e.RequestID = &r
	}
	if changesStr != nil {
		e.Changes = json.RawMessage(*changesStr)
	}
	if metaStr != nil {
		e.Metadata = json.RawMessage(*metaStr)
	}

	return e, nil
}

func nilIfEmpty(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}

func nilableJSON(m json.RawMessage) json.RawMessage {
	if len(m) == 0 {
		return nil
	}
	return m
}
