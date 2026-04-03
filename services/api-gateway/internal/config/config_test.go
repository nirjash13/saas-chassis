package config_test

import (
	"os"
	"testing"

	"github.com/your-org/saas-chassis/api-gateway/internal/config"
)

func setEnv(t *testing.T, key, value string) {
	t.Helper()
	t.Setenv(key, value)
}

func TestLoad_AllVarsSet(t *testing.T) {
	setEnv(t, "PORT", "9090")
	setEnv(t, "JWT_SECRET", "supersecret")
	setEnv(t, "REDIS_URL", "redis://redis-host:6380")
	setEnv(t, "INTERNAL_SERVICE_TOKEN", "internal-tok")
	setEnv(t, "IDENTITY_SERVICE_URL", "http://identity:3001")
	setEnv(t, "TENANT_MANAGER_URL", "http://tenant:3002")
	setEnv(t, "BILLING_ENGINE_URL", "http://billing:3003")
	setEnv(t, "AUDIT_SERVICE_URL", "http://audit:3005")
	setEnv(t, "LEDGER_SERVICE_URL", "http://ledger:3006")
	setEnv(t, "PRODUCT_ROUTES", "bari=http://bari:3010,school=http://school:3020")

	cfg := config.Load()

	t.Run("Port", func(t *testing.T) {
		if cfg.Port != "9090" {
			t.Errorf("Port = %q; want %q", cfg.Port, "9090")
		}
	})
	t.Run("JWTSecret", func(t *testing.T) {
		if cfg.JWTSecret != "supersecret" {
			t.Errorf("JWTSecret = %q; want %q", cfg.JWTSecret, "supersecret")
		}
	})
	t.Run("RedisURL", func(t *testing.T) {
		if cfg.RedisURL != "redis://redis-host:6380" {
			t.Errorf("RedisURL = %q; want %q", cfg.RedisURL, "redis://redis-host:6380")
		}
	})
	t.Run("InternalServiceToken", func(t *testing.T) {
		if cfg.InternalServiceToken != "internal-tok" {
			t.Errorf("InternalServiceToken = %q; want %q", cfg.InternalServiceToken, "internal-tok")
		}
	})
	t.Run("IdentityServiceURL", func(t *testing.T) {
		if cfg.IdentityServiceURL != "http://identity:3001" {
			t.Errorf("IdentityServiceURL = %q; want %q", cfg.IdentityServiceURL, "http://identity:3001")
		}
	})
	t.Run("TenantManagerURL", func(t *testing.T) {
		if cfg.TenantManagerURL != "http://tenant:3002" {
			t.Errorf("TenantManagerURL = %q; want %q", cfg.TenantManagerURL, "http://tenant:3002")
		}
	})
	t.Run("BillingEngineURL", func(t *testing.T) {
		if cfg.BillingEngineURL != "http://billing:3003" {
			t.Errorf("BillingEngineURL = %q; want %q", cfg.BillingEngineURL, "http://billing:3003")
		}
	})
	t.Run("AuditServiceURL", func(t *testing.T) {
		if cfg.AuditServiceURL != "http://audit:3005" {
			t.Errorf("AuditServiceURL = %q; want %q", cfg.AuditServiceURL, "http://audit:3005")
		}
	})
	t.Run("LedgerServiceURL", func(t *testing.T) {
		if cfg.LedgerServiceURL != "http://ledger:3006" {
			t.Errorf("LedgerServiceURL = %q; want %q", cfg.LedgerServiceURL, "http://ledger:3006")
		}
	})
	t.Run("ProductRoutes", func(t *testing.T) {
		if cfg.ProductRoutes != "bari=http://bari:3010,school=http://school:3020" {
			t.Errorf("ProductRoutes = %q; unexpected value", cfg.ProductRoutes)
		}
	})
}

func TestLoad_DefaultValues(t *testing.T) {
	// Clear all relevant env vars so defaults apply.
	vars := []string{
		"PORT", "JWT_SECRET", "REDIS_URL", "INTERNAL_SERVICE_TOKEN",
		"IDENTITY_SERVICE_URL", "TENANT_MANAGER_URL", "BILLING_ENGINE_URL",
		"AUDIT_SERVICE_URL", "LEDGER_SERVICE_URL", "PRODUCT_ROUTES",
	}
	for _, v := range vars {
		os.Unsetenv(v) //nolint:errcheck
	}

	cfg := config.Load()

	t.Run("DefaultPort", func(t *testing.T) {
		if cfg.Port != "8080" {
			t.Errorf("Port = %q; want default %q", cfg.Port, "8080")
		}
	})
	t.Run("MissingJWTSecret_EmptyString", func(t *testing.T) {
		// JWT_SECRET has no default; startup validation (main.go) handles the empty case.
		if cfg.JWTSecret != "" {
			t.Errorf("JWTSecret = %q; want empty string when env var is unset", cfg.JWTSecret)
		}
	})
	t.Run("DefaultRedisURL", func(t *testing.T) {
		if cfg.RedisURL != "redis://localhost:6379" {
			t.Errorf("RedisURL = %q; want default %q", cfg.RedisURL, "redis://localhost:6379")
		}
	})
	t.Run("DefaultIdentityServiceURL", func(t *testing.T) {
		if cfg.IdentityServiceURL != "http://localhost:3001" {
			t.Errorf("IdentityServiceURL = %q; want default", cfg.IdentityServiceURL)
		}
	})
}

func TestParseProductRoutes_ValidInput(t *testing.T) {
	cfg := &config.Config{
		ProductRoutes: "bari=http://barimanager-api:3010,school=http://school-api:3020",
	}

	routes := cfg.ParseProductRoutes()

	if len(routes) != 2 {
		t.Fatalf("ParseProductRoutes returned %d routes; want 2", len(routes))
	}

	t.Run("FirstRoute", func(t *testing.T) {
		if routes[0].PathPrefix != "bari" {
			t.Errorf("routes[0].PathPrefix = %q; want %q", routes[0].PathPrefix, "bari")
		}
		if routes[0].TargetURL != "http://barimanager-api:3010" {
			t.Errorf("routes[0].TargetURL = %q; want %q", routes[0].TargetURL, "http://barimanager-api:3010")
		}
	})

	t.Run("SecondRoute", func(t *testing.T) {
		if routes[1].PathPrefix != "school" {
			t.Errorf("routes[1].PathPrefix = %q; want %q", routes[1].PathPrefix, "school")
		}
		if routes[1].TargetURL != "http://school-api:3020" {
			t.Errorf("routes[1].TargetURL = %q; want %q", routes[1].TargetURL, "http://school-api:3020")
		}
	})
}

func TestParseProductRoutes_EmptyString(t *testing.T) {
	cfg := &config.Config{ProductRoutes: ""}
	routes := cfg.ParseProductRoutes()

	if routes != nil {
		t.Errorf("ParseProductRoutes(\"\") = %v; want nil (empty slice)", routes)
	}
}

func TestParseProductRoutes_SingleEntry(t *testing.T) {
	cfg := &config.Config{ProductRoutes: "myapp=http://myapp:8000"}
	routes := cfg.ParseProductRoutes()

	if len(routes) != 1 {
		t.Fatalf("ParseProductRoutes returned %d routes; want 1", len(routes))
	}
	if routes[0].PathPrefix != "myapp" {
		t.Errorf("PathPrefix = %q; want %q", routes[0].PathPrefix, "myapp")
	}
	if routes[0].TargetURL != "http://myapp:8000" {
		t.Errorf("TargetURL = %q; want %q", routes[0].TargetURL, "http://myapp:8000")
	}
}

func TestParseProductRoutes_MalformedEntrySkipped(t *testing.T) {
	// An entry without "=" should be skipped; the valid one should still parse.
	cfg := &config.Config{ProductRoutes: "noequals,good=http://good:9000"}
	routes := cfg.ParseProductRoutes()

	if len(routes) != 1 {
		t.Fatalf("ParseProductRoutes returned %d routes; want 1 (malformed entry skipped)", len(routes))
	}
	if routes[0].PathPrefix != "good" {
		t.Errorf("PathPrefix = %q; want %q", routes[0].PathPrefix, "good")
	}
}

func TestParseProductRoutes_URLContainsEquals(t *testing.T) {
	// SplitN(entry, "=", 2) means only the first "=" splits; rest of URL is preserved.
	cfg := &config.Config{ProductRoutes: "app=http://host:8080/path?foo=bar"}
	routes := cfg.ParseProductRoutes()

	if len(routes) != 1 {
		t.Fatalf("ParseProductRoutes returned %d routes; want 1", len(routes))
	}
	if routes[0].TargetURL != "http://host:8080/path?foo=bar" {
		t.Errorf("TargetURL = %q; want full URL with query string", routes[0].TargetURL)
	}
}
