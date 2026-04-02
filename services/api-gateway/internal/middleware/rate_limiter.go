package middleware

import (
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"github.com/your-org/saas-chassis/api-gateway/internal/ratelimit"
)

// RateLimitMiddleware enforces per-tenant sliding-window rate limits backed by Redis.
func RateLimitMiddleware(redisClient *redis.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		tenantID := c.GetHeader("X-Tenant-ID")
		plan := c.GetString("tenant_plan")

		limits := ratelimit.PlanLimits[plan]
		if limits.RequestsPerMinute == 0 {
			limits = ratelimit.PlanLimits["free"]
		}

		key := fmt.Sprintf("ratelimit:%s:%d", tenantID, time.Now().Unix()/60)
		count, err := redisClient.Incr(c, key).Result()
		if err != nil {
			c.Next() // fail open
			return
		}

		if count == 1 {
			redisClient.Expire(c, key, 2*time.Minute) //nolint:errcheck
		}

		c.Header("X-RateLimit-Limit", strconv.Itoa(limits.RequestsPerMinute))
		c.Header("X-RateLimit-Remaining", strconv.Itoa(max(0, limits.RequestsPerMinute-int(count))))

		if int(count) > limits.RequestsPerMinute {
			c.Header("Retry-After", "60")
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
				"error":      "rate limit exceeded",
				"retryAfter": 60,
			})
			return
		}

		c.Next()
	}
}
