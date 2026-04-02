package middleware

import (
	"context"
	"fmt"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
)

// MeteringMiddleware tracks per-tenant API usage in Redis for analytics and metered billing.
func MeteringMiddleware(redisClient *redis.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()

		duration := time.Since(start)
		_ = duration // captured for future latency tracking

		tenantID := c.GetHeader("X-Tenant-ID")
		userID := c.GetHeader("X-User-ID")
		method := c.Request.Method
		path := c.FullPath()
		status := c.Writer.Status()

		// Fire-and-forget Redis pipeline
		go func() {
			dateKey := fmt.Sprintf("meter:%s:%s", tenantID, time.Now().Format("2006-01-02"))
			pipe := redisClient.Pipeline()
			pipe.HIncrBy(context.Background(), dateKey, "total", 1)
			pipe.HIncrBy(context.Background(), dateKey, fmt.Sprintf("user:%s", userID), 1)
			pipe.HIncrBy(context.Background(), dateKey, fmt.Sprintf("endpoint:%s:%s", method, path), 1)
			pipe.HIncrBy(context.Background(), dateKey, fmt.Sprintf("status:%d", status), 1)
			pipe.Expire(context.Background(), dateKey, 48*time.Hour)
			pipe.Exec(context.Background()) //nolint:errcheck
		}()
	}
}
