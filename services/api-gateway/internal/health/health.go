package health

import (
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/your-org/saas-chassis/api-gateway/internal/config"
)

// ServiceHealth holds the result of a single backend health probe.
type ServiceHealth struct {
	Status  string `json:"status"`
	Latency string `json:"latency,omitempty"`
	Error   string `json:"error,omitempty"`
}

// HealthResponse is the JSON shape returned by the health endpoint.
type HealthResponse struct {
	Status   string                    `json:"status"`
	Version  string                    `json:"version"`
	Services map[string]ServiceHealth  `json:"services"`
}

// Handler returns a gin handler that probes each backend service and aggregates results.
func Handler(cfg *config.Config) gin.HandlerFunc {
	backends := map[string]string{
		"identity-service": cfg.IdentityServiceURL,
		"tenant-manager":   cfg.TenantManagerURL,
		"billing-engine":   cfg.BillingEngineURL,
		"audit-service":    cfg.AuditServiceURL,
		"ledger-service":   cfg.LedgerServiceURL,
	}

	httpClient := &http.Client{Timeout: 2 * time.Second}

	return func(c *gin.Context) {
		var mu sync.Mutex
		var wg sync.WaitGroup
		services := make(map[string]ServiceHealth, len(backends))
		allHealthy := true

		for name, baseURL := range backends {
			wg.Add(1)
			go func(svcName, url string) {
				defer wg.Done()

				target := fmt.Sprintf("%s/health", url)
				start := time.Now()
				resp, err := httpClient.Get(target)
				elapsed := time.Since(start)

				var sh ServiceHealth
				if err != nil {
					sh = ServiceHealth{
						Status: "unhealthy",
						Error:  err.Error(),
					}
				} else {
					resp.Body.Close()
					sh = ServiceHealth{
						Status:  "ok",
						Latency: elapsed.Round(time.Millisecond).String(),
					}
					if resp.StatusCode >= 500 {
						sh.Status = "unhealthy"
						sh.Error = fmt.Sprintf("status %d", resp.StatusCode)
					}
				}

				mu.Lock()
				services[svcName] = sh
				if sh.Status != "ok" {
					allHealthy = false
				}
				mu.Unlock()
			}(name, baseURL)
		}

		wg.Wait()

		overallStatus := "ok"
		httpStatus := http.StatusOK
		if !allHealthy {
			overallStatus = "degraded"
			httpStatus = http.StatusServiceUnavailable
		}

		c.JSON(httpStatus, HealthResponse{
			Status:   overallStatus,
			Version:  "1.0.0",
			Services: services,
		})
	}
}
