package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// InternalAuthMiddleware validates the X-Service-Token header for internal
// service-to-service routes. If the configured token is empty the middleware
// is a no-op (useful for local development without token enforcement).
func InternalAuthMiddleware(token string) gin.HandlerFunc {
	return func(c *gin.Context) {
		if token == "" {
			c.Next()
			return
		}
		provided := c.GetHeader("X-Service-Token")
		if provided != token {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid service token"})
			return
		}
		c.Next()
	}
}
