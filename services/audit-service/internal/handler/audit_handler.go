package handler

import (
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/rs/zerolog"
	"github.com/your-org/saas-chassis/audit-service/internal/repository"
)

// callerCtx holds the authenticated caller's identity extracted from X-headers
// injected by the API gateway.
type callerCtx struct {
	TenantID        string
	UserID          string
	IsPlatformAdmin bool
}

func extractCaller(c *gin.Context) (callerCtx, bool) {
	tenantID := c.GetHeader("X-Tenant-ID")
	userID := c.GetHeader("X-User-ID")
	isPlatformAdmin := c.GetHeader("X-Is-Platform-Admin") == "true"

	if tenantID == "" && !isPlatformAdmin {
		return callerCtx{}, false
	}
	return callerCtx{
		TenantID:        tenantID,
		UserID:          userID,
		IsPlatformAdmin: isPlatformAdmin,
	}, true
}

// AuditHandler handles HTTP requests for audit log queries.
type AuditHandler struct {
	repo   *repository.AuditRepository
	logger zerolog.Logger
}

func NewAuditHandler(repo *repository.AuditRepository, logger zerolog.Logger) *AuditHandler {
	return &AuditHandler{repo: repo, logger: logger}
}

// ListEntries handles GET /api/v1/audit/entries
func (h *AuditHandler) ListEntries(c *gin.Context) {
	caller, ok := extractCaller(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	filter := repository.QueryFilter{
		TenantID:     c.Query("tenantId"),
		UserID:       c.Query("userId"),
		Action:       c.Query("action"),
		ResourceType: c.Query("resourceType"),
		Page:         parseIntQuery(c, "page", 1),
		PageSize:     parseIntQuery(c, "pageSize", 50),
	}

	if from := c.Query("from"); from != "" {
		if t, err := time.Parse(time.RFC3339, from); err == nil {
			filter.From = &t
		}
	}
	if to := c.Query("to"); to != "" {
		if t, err := time.Parse(time.RFC3339, to); err == nil {
			filter.To = &t
		}
	}

	tc := repository.TenantContext{
		TenantID:        caller.TenantID,
		IsPlatformAdmin: caller.IsPlatformAdmin,
	}

	entries, total, err := h.repo.QueryEntries(c.Request.Context(), tc, filter)
	if err != nil {
		h.logger.Error().Err(err).Msg("query entries failed")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data":     entries,
		"total":    total,
		"page":     filter.Page,
		"pageSize": filter.PageSize,
	})
}

// GetEntry handles GET /api/v1/audit/entries/:id
func (h *AuditHandler) GetEntry(c *gin.Context) {
	caller, ok := extractCaller(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	tc := repository.TenantContext{
		TenantID:        caller.TenantID,
		IsPlatformAdmin: caller.IsPlatformAdmin,
	}

	entry, err := h.repo.FindByID(c.Request.Context(), tc, c.Param("id"))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		} else {
			h.logger.Error().Err(err).Msg("find entry by id failed")
			c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": entry})
}

// GetSummary handles GET /api/v1/audit/summary (platform admin only)
func (h *AuditHandler) GetSummary(c *gin.Context) {
	caller, ok := extractCaller(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	if !caller.IsPlatformAdmin {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}

	summary, err := h.repo.GetSummary(c.Request.Context())
	if err != nil {
		h.logger.Error().Err(err).Msg("get summary failed")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": summary})
}

func parseIntQuery(c *gin.Context, key string, defaultVal int) int {
	if v := c.Query(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return n
		}
	}
	return defaultVal
}
