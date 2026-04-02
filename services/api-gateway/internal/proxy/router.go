package proxy

import (
	"fmt"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"
	"github.com/your-org/saas-chassis/api-gateway/internal/config"
	"github.com/your-org/saas-chassis/api-gateway/internal/health"
	"github.com/your-org/saas-chassis/api-gateway/internal/middleware"
)

// SetupRoutes registers all gateway routes on the provided gin engine.
func SetupRoutes(r *gin.Engine, cfg *config.Config, redisClient *redis.Client, logger zerolog.Logger) {
	// Public routes — no auth
	public := r.Group("/api/v1")
	{
		public.POST("/auth/register", proxyTo(cfg.IdentityServiceURL, logger))
		public.POST("/auth/login", proxyTo(cfg.IdentityServiceURL, logger))
		public.POST("/auth/refresh", proxyTo(cfg.IdentityServiceURL, logger))
	}

	// Authenticated routes
	authed := r.Group("/api/v1")
	authed.Use(middleware.AuthMiddleware(cfg.JWTSecret))
	authed.Use(middleware.RateLimitMiddleware(redisClient))
	authed.Use(middleware.MeteringMiddleware(redisClient))
	{
		authed.Any("/auth/*path", proxyTo(cfg.IdentityServiceURL, logger))
		authed.Any("/users/*path", proxyTo(cfg.IdentityServiceURL, logger))
		authed.Any("/impersonate", proxyTo(cfg.IdentityServiceURL, logger))

		authed.Any("/tenants/*path", proxyTo(cfg.TenantManagerURL, logger))
		authed.Any("/features/*path", proxyTo(cfg.TenantManagerURL, logger))

		authed.Any("/billing/*path", proxyTo(cfg.BillingEngineURL, logger))
		authed.Any("/ledger/*path", proxyTo(cfg.LedgerServiceURL, logger))
		authed.Any("/audit/*path", proxyTo(cfg.AuditServiceURL, logger))

		for _, route := range cfg.ParseProductRoutes() {
			logger.Info().Str("prefix", route.PathPrefix).Str("target", route.TargetURL).Msg("registering product route")
			target := route.TargetURL // capture loop variable
			authed.Any(fmt.Sprintf("/%s/*path", route.PathPrefix), proxyTo(target, logger))
		}
	}

	// Webhook routes — signature verified by billing service, not JWT
	webhooks := r.Group("/webhooks")
	{
		webhooks.POST("/stripe", proxyTo(cfg.BillingEngineURL, logger))
	}

	// Health
	r.GET("/health", health.Handler(cfg))
}
