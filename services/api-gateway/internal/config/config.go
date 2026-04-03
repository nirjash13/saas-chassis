package config

import (
	"os"
	"strings"
)

type Config struct {
	Port                 string
	JWTSecret            string
	RedisURL             string
	DatabaseURL          string
	InternalServiceToken string

	// Chassis service URLs (always present)
	IdentityServiceURL string
	TenantManagerURL   string
	BillingEngineURL   string
	AuditServiceURL    string
	LedgerServiceURL   string

	// Dynamic product routing (configured per deployment)
	// Format: comma-separated "prefix=url" pairs
	// e.g., "bari=http://barimanager-api:3010,school=http://school-api:3020"
	ProductRoutes string
}

type ProductRoute struct {
	PathPrefix string
	TargetURL  string
}

func Load() *Config {
	return &Config{
		Port:                 getEnv("PORT", "8080"),
		JWTSecret:            getEnv("JWT_SECRET", ""),
		RedisURL:             getEnv("REDIS_URL", "redis://localhost:6379"),
		DatabaseURL:          getEnv("DATABASE_URL", ""),
		InternalServiceToken: getEnv("INTERNAL_SERVICE_TOKEN", ""),

		IdentityServiceURL: getEnv("IDENTITY_SERVICE_URL", "http://localhost:3001"),
		TenantManagerURL:   getEnv("TENANT_MANAGER_URL", "http://localhost:3002"),
		BillingEngineURL:   getEnv("BILLING_ENGINE_URL", "http://localhost:3003"),
		AuditServiceURL:    getEnv("AUDIT_SERVICE_URL", "http://localhost:3005"),
		LedgerServiceURL:   getEnv("LEDGER_SERVICE_URL", "http://localhost:3006"),
		ProductRoutes:      getEnv("PRODUCT_ROUTES", ""),
	}
}

// ParseProductRoutes parses the PRODUCT_ROUTES env var into structured routes.
func (c *Config) ParseProductRoutes() []ProductRoute {
	if c.ProductRoutes == "" {
		return nil
	}
	var routes []ProductRoute
	for _, entry := range strings.Split(c.ProductRoutes, ",") {
		parts := strings.SplitN(strings.TrimSpace(entry), "=", 2)
		if len(parts) == 2 {
			routes = append(routes, ProductRoute{
				PathPrefix: parts[0],
				TargetURL:  parts[1],
			})
		}
	}
	return routes
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
