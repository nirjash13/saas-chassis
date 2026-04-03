package health_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/your-org/saas-chassis/api-gateway/internal/config"
	"github.com/your-org/saas-chassis/api-gateway/internal/health"
)

func init() {
	gin.SetMode(gin.TestMode)
}

// healthyBackend returns an httptest.Server that always responds with 200 OK.
func healthyBackend(t *testing.T) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	t.Cleanup(srv.Close)
	return srv
}

// unhealthyBackend returns an httptest.Server that always responds with 500.
func unhealthyBackend(t *testing.T) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	t.Cleanup(srv.Close)
	return srv
}

// unreachableURL returns a URL that is guaranteed to refuse connections so the
// health handler records the service as unhealthy due to a network error.
func unreachableURL() string {
	// Port 1 is reserved and never listening; connection will fail immediately.
	return "http://127.0.0.1:1"
}

// callHealthHandler invokes the health.Handler with the given config and returns
// the parsed HealthResponse and HTTP status code.
func callHealthHandler(t *testing.T, cfg *config.Config) (health.HealthResponse, int) {
	t.Helper()
	r := gin.New()
	r.GET("/health", health.Handler(cfg))

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	r.ServeHTTP(w, req)

	var resp health.HealthResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode health response: %v", err)
	}
	return resp, w.Code
}

func TestHealthHandler_AllBackendsHealthy(t *testing.T) {
	identity := healthyBackend(t)
	tenant := healthyBackend(t)
	billing := healthyBackend(t)
	audit := healthyBackend(t)
	ledger := healthyBackend(t)

	cfg := &config.Config{
		IdentityServiceURL: identity.URL,
		TenantManagerURL:   tenant.URL,
		BillingEngineURL:   billing.URL,
		AuditServiceURL:    audit.URL,
		LedgerServiceURL:   ledger.URL,
	}

	resp, code := callHealthHandler(t, cfg)

	t.Run("HTTPStatus200", func(t *testing.T) {
		if code != http.StatusOK {
			t.Errorf("HTTP status = %d; want 200", code)
		}
	})

	t.Run("OverallStatusOK", func(t *testing.T) {
		if resp.Status != "ok" {
			t.Errorf("Status = %q; want %q", resp.Status, "ok")
		}
	})

	t.Run("AllServicesOK", func(t *testing.T) {
		for name, svc := range resp.Services {
			if svc.Status != "ok" {
				t.Errorf("services[%q].Status = %q; want %q", name, svc.Status, "ok")
			}
		}
	})

	t.Run("FiveServicesReported", func(t *testing.T) {
		if len(resp.Services) != 5 {
			t.Errorf("len(services) = %d; want 5", len(resp.Services))
		}
	})
}

func TestHealthHandler_OneBackendUnhealthy_Returns503(t *testing.T) {
	identity := healthyBackend(t)
	tenant := healthyBackend(t)
	billing := healthyBackend(t)
	// audit service returns 500 — should be marked unhealthy.
	audit := unhealthyBackend(t)
	ledger := healthyBackend(t)

	cfg := &config.Config{
		IdentityServiceURL: identity.URL,
		TenantManagerURL:   tenant.URL,
		BillingEngineURL:   billing.URL,
		AuditServiceURL:    audit.URL,
		LedgerServiceURL:   ledger.URL,
	}

	resp, code := callHealthHandler(t, cfg)

	t.Run("HTTPStatus503", func(t *testing.T) {
		if code != http.StatusServiceUnavailable {
			t.Errorf("HTTP status = %d; want 503", code)
		}
	})

	t.Run("OverallStatusDegraded", func(t *testing.T) {
		if resp.Status != "degraded" {
			t.Errorf("Status = %q; want %q", resp.Status, "degraded")
		}
	})

	t.Run("AuditServiceUnhealthy", func(t *testing.T) {
		svc, ok := resp.Services["audit-service"]
		if !ok {
			t.Fatal("audit-service not present in services map")
		}
		if svc.Status != "unhealthy" {
			t.Errorf("audit-service status = %q; want %q", svc.Status, "unhealthy")
		}
	})

	t.Run("HealthyServicesStillOK", func(t *testing.T) {
		healthyNames := []string{"identity-service", "tenant-manager", "billing-engine", "ledger-service"}
		for _, name := range healthyNames {
			svc, ok := resp.Services[name]
			if !ok {
				t.Errorf("service %q missing from response", name)
				continue
			}
			if svc.Status != "ok" {
				t.Errorf("services[%q].Status = %q; want %q", name, svc.Status, "ok")
			}
		}
	})
}

func TestHealthHandler_UnreachableBackend_Returns503(t *testing.T) {
	identity := healthyBackend(t)
	tenant := healthyBackend(t)
	billing := healthyBackend(t)
	audit := healthyBackend(t)

	cfg := &config.Config{
		IdentityServiceURL: identity.URL,
		TenantManagerURL:   tenant.URL,
		BillingEngineURL:   billing.URL,
		AuditServiceURL:    audit.URL,
		// Ledger service URL points to an address that will fail to connect.
		LedgerServiceURL: unreachableURL(),
	}

	resp, code := callHealthHandler(t, cfg)

	t.Run("HTTPStatus503", func(t *testing.T) {
		if code != http.StatusServiceUnavailable {
			t.Errorf("HTTP status = %d; want 503", code)
		}
	})

	t.Run("LedgerServiceUnhealthy", func(t *testing.T) {
		svc, ok := resp.Services["ledger-service"]
		if !ok {
			t.Fatal("ledger-service not present in services map")
		}
		if svc.Status != "unhealthy" {
			t.Errorf("ledger-service status = %q; want %q", svc.Status, "unhealthy")
		}
		if svc.Error == "" {
			t.Error("ledger-service Error field is empty; expected connection error message")
		}
	})
}

func TestHealthHandler_LatencyPopulated(t *testing.T) {
	backend := healthyBackend(t)

	cfg := &config.Config{
		IdentityServiceURL: backend.URL,
		TenantManagerURL:   backend.URL,
		BillingEngineURL:   backend.URL,
		AuditServiceURL:    backend.URL,
		LedgerServiceURL:   backend.URL,
	}

	resp, _ := callHealthHandler(t, cfg)

	// Every healthy service should have a non-empty Latency field.
	for name, svc := range resp.Services {
		if svc.Status == "ok" && svc.Latency == "" {
			t.Errorf("services[%q].Latency is empty; want a duration string", name)
		}
	}
}

func TestHealthHandler_VersionFieldPresent(t *testing.T) {
	backend := healthyBackend(t)
	cfg := &config.Config{
		IdentityServiceURL: backend.URL,
		TenantManagerURL:   backend.URL,
		BillingEngineURL:   backend.URL,
		AuditServiceURL:    backend.URL,
		LedgerServiceURL:   backend.URL,
	}

	resp, _ := callHealthHandler(t, cfg)

	if resp.Version == "" {
		t.Error("Version field is empty in health response")
	}
}
