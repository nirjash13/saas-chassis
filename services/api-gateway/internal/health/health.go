package health

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/your-org/saas-chassis/api-gateway/internal/config"
)

// HealthResponse is the JSON shape returned by the health endpoint.
type HealthResponse struct {
	Status   string            `json:"status"`
	Version  string            `json:"version"`
	Services map[string]string `json:"services,omitempty"`
}

// Handler returns a gin handler that reports gateway health.
func Handler(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.JSON(http.StatusOK, HealthResponse{
			Status:  "ok",
			Version: "1.0.0",
		})
	}
}
