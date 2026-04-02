package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog"
	"github.com/your-org/saas-chassis/audit-service/internal/repository"
)

// HealthHandler serves health-related endpoints.
type HealthHandler struct {
	repo   *repository.AuditRepository
	logger zerolog.Logger
}

func NewHealthHandler(repo *repository.AuditRepository, logger zerolog.Logger) *HealthHandler {
	return &HealthHandler{repo: repo, logger: logger}
}

// GetServiceHealth handles GET /api/v1/audit/health (platform admin only)
func (h *HealthHandler) GetServiceHealth(c *gin.Context) {
	caller, ok := extractCaller(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	if !caller.IsPlatformAdmin {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}

	health, err := h.repo.GetServiceHealth(c.Request.Context())
	if err != nil {
		h.logger.Error().Err(err).Msg("get service health failed")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": health})
}

// SelfHealth returns a simple liveness response for this service.
func SelfHealth() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok", "service": "audit-service"})
	}
}
