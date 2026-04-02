package middleware

import (
	"os"
	"strings"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

// CORSMiddleware configures CORS using gin-contrib/cors.
func CORSMiddleware() gin.HandlerFunc {
	originsEnv := os.Getenv("CORS_ORIGINS")
	var allowOrigins []string
	if originsEnv == "" {
		allowOrigins = []string{"*"}
	} else {
		for _, o := range strings.Split(originsEnv, ",") {
			trimmed := strings.TrimSpace(o)
			if trimmed != "" {
				allowOrigins = append(allowOrigins, trimmed)
			}
		}
	}

	// AllowCredentials must be false when AllowOrigins contains "*"
	allowCredentials := true
	for _, o := range allowOrigins {
		if o == "*" {
			allowCredentials = false
			break
		}
	}

	cfg := cors.Config{
		AllowOrigins: allowOrigins,
		AllowMethods: []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders: []string{
			"Authorization",
			"Content-Type",
			"X-Request-ID",
			"X-Tenant-ID",
		},
		ExposeHeaders: []string{
			"X-Request-ID",
			"X-RateLimit-Limit",
			"X-RateLimit-Remaining",
		},
		AllowCredentials: allowCredentials,
	}

	return cors.New(cfg)
}
