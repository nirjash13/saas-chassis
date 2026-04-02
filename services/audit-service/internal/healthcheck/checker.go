package healthcheck

import (
	"context"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog"
	"github.com/your-org/saas-chassis/audit-service/internal/repository"
)

type serviceEndpoint struct {
	Name string
	URL  string
}

var services = []serviceEndpoint{
	{"identity-service", "http://identity-service:3001/health"},
	{"tenant-manager", "http://tenant-manager:3002/health"},
	{"billing-engine", "http://billing-engine:3003/health"},
	{"api-gateway", "http://api-gateway:8080/health"},
	{"universal-ledger", "http://universal-ledger:3006/health"},
}

// RunHealthChecker polls all chassis services every 30 seconds and persists results.
func RunHealthChecker(pool *pgxpool.Pool, logger zerolog.Logger) {
	repo := repository.NewAuditRepository(pool, logger)
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		for _, svc := range services {
			go checkService(repo, svc, logger)
		}
	}
}

func checkService(repo *repository.AuditRepository, svc serviceEndpoint, logger zerolog.Logger) {
	client := &http.Client{Timeout: 5 * time.Second}

	start := time.Now()
	resp, err := client.Get(svc.URL)
	elapsed := time.Since(start).Milliseconds()

	status := "healthy"
	switch {
	case err != nil:
		status = "down"
	case resp.StatusCode != http.StatusOK:
		status = "down"
	case elapsed > 2000:
		status = "degraded"
	}

	if resp != nil {
		resp.Body.Close()
	}

	repo.UpsertServiceHealth(context.Background(), svc.Name, status, elapsed)
	logger.Debug().
		Str("service", svc.Name).
		Str("status", status).
		Int64("ms", elapsed).
		Msg("health check")
}
