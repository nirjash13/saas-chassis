package middleware_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"github.com/your-org/saas-chassis/api-gateway/internal/middleware"
	"github.com/your-org/saas-chassis/api-gateway/internal/ratelimit"
)

func init() {
	gin.SetMode(gin.TestMode)
}

// testRedis starts an in-memory Redis server and returns the client and cleanup.
func testRedis(t *testing.T) (*redis.Client, *miniredis.Miniredis) {
	t.Helper()
	mr, err := miniredis.Run()
	if err != nil {
		t.Fatalf("miniredis.Run: %v", err)
	}
	t.Cleanup(mr.Close)
	client := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	return client, mr
}

// rateLimitRouter builds a Gin engine with tenant context pre-set and
// RateLimitMiddleware installed. The tenantID is set as the X-Tenant-ID header
// and the plan name is injected into the Gin context (as AuthMiddleware would do).
func rateLimitRouter(t *testing.T, client *redis.Client, tenantID, plan string) *gin.Engine {
	t.Helper()
	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Request.Header.Set("X-Tenant-ID", tenantID)
		c.Set("tenant_plan", plan)
		c.Next()
	})
	r.Use(middleware.RateLimitMiddleware(client))
	r.GET("/test", func(c *gin.Context) {
		c.Status(http.StatusOK)
	})
	return r
}

// sendRequest fires a single GET /test and returns the recorded response.
func sendRequest(r *gin.Engine) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	r.ServeHTTP(w, req)
	return w
}

// minuteKey mirrors the key formula used in rate_limiter.go so tests can
// pre-seed Redis counters for specific scenarios.
func minuteKey(tenantID string) string {
	return fmt.Sprintf("ratelimit:%s:%d", tenantID, time.Now().Unix()/60)
}

// hourKey mirrors the hour-bucket key formula from rate_limiter.go.
func hourKey(tenantID string) string {
	return fmt.Sprintf("ratelimit:%s:hour:%d", tenantID, time.Now().Unix()/3600)
}

// burstKey mirrors the per-second burst key formula from rate_limiter.go.
func burstKey(tenantID string) string {
	return fmt.Sprintf("ratelimit:%s:burst:%d", tenantID, time.Now().Unix())
}

// TestRateLimiter_FreePlan_ExceedsRequestsPerMinute verifies that a tenant on the
// free plan receives 429 with Retry-After: 60 once RequestsPerMinute is surpassed.
func TestRateLimiter_FreePlan_ExceedsRequestsPerMinute(t *testing.T) {
	client, _ := testRedis(t)
	tenantID := "tenant-rpm-test"
	r := rateLimitRouter(t, client, tenantID, "free")

	limits := ratelimit.PlanLimits["free"]

	// Pre-seed the minute counter to the exact limit so the very next request
	// exceeds it. This avoids sending N real requests and keeps the test fast.
	ctx := context.Background()
	key := minuteKey(tenantID)
	if err := client.Set(ctx, key, limits.RequestsPerMinute, 2*time.Minute).Err(); err != nil {
		t.Fatalf("pre-seed minute counter: %v", err)
	}

	w := sendRequest(r)

	if w.Code != http.StatusTooManyRequests {
		t.Errorf("status = %d; want %d (429)", w.Code, http.StatusTooManyRequests)
	}
	if v := w.Header().Get("Retry-After"); v != "60" {
		t.Errorf("Retry-After = %q; want %q", v, "60")
	}

	var body map[string]interface{}
	if err := json.NewDecoder(w.Body).Decode(&body); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	if body["error"] != "rate limit exceeded" {
		t.Errorf("error = %q; want %q", body["error"], "rate limit exceeded")
	}
}

// TestRateLimiter_FreePlan_ExceedsRequestsPerHour verifies that a tenant on the
// free plan receives 429 with Retry-After: 3600 when the hourly quota is consumed.
func TestRateLimiter_FreePlan_ExceedsRequestsPerHour(t *testing.T) {
	client, _ := testRedis(t)
	tenantID := "tenant-rph-test"
	r := rateLimitRouter(t, client, tenantID, "free")

	limits := ratelimit.PlanLimits["free"]
	ctx := context.Background()

	// Keep the minute counter safely below RequestsPerMinute so only the hourly
	// check fires. Set minute counter to 1 (one request sent).
	minuteK := minuteKey(tenantID)
	if err := client.Set(ctx, minuteK, 1, 2*time.Minute).Err(); err != nil {
		t.Fatalf("pre-seed minute counter: %v", err)
	}

	// Pre-seed the hour counter to the exact limit so the next INCR exceeds it.
	hourK := hourKey(tenantID)
	if err := client.Set(ctx, hourK, limits.RequestsPerHour, 2*time.Hour).Err(); err != nil {
		t.Fatalf("pre-seed hour counter: %v", err)
	}

	w := sendRequest(r)

	if w.Code != http.StatusTooManyRequests {
		t.Errorf("status = %d; want %d (429)", w.Code, http.StatusTooManyRequests)
	}
	if v := w.Header().Get("Retry-After"); v != "3600" {
		t.Errorf("Retry-After = %q; want %q", v, "3600")
	}

	var body map[string]interface{}
	if err := json.NewDecoder(w.Body).Decode(&body); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	if body["error"] != "hourly rate limit exceeded" {
		t.Errorf("error = %q; want %q", body["error"], "hourly rate limit exceeded")
	}
}

// TestRateLimiter_BurstLimitExceeded verifies that a tenant receives 429 with
// Retry-After: 1 when more requests arrive within a single second than BurstSize.
func TestRateLimiter_BurstLimitExceeded(t *testing.T) {
	client, _ := testRedis(t)
	tenantID := "tenant-burst-test"
	r := rateLimitRouter(t, client, tenantID, "free")

	limits := ratelimit.PlanLimits["free"]
	ctx := context.Background()

	// Keep minute and hour counters at 1 (well below their thresholds).
	if err := client.Set(ctx, minuteKey(tenantID), 1, 2*time.Minute).Err(); err != nil {
		t.Fatalf("pre-seed minute counter: %v", err)
	}
	if err := client.Set(ctx, hourKey(tenantID), 1, 2*time.Hour).Err(); err != nil {
		t.Fatalf("pre-seed hour counter: %v", err)
	}

	// Pre-seed the burst counter to BurstSize so the next request exceeds it.
	burstK := burstKey(tenantID)
	if err := client.Set(ctx, burstK, limits.BurstSize, 2*time.Second).Err(); err != nil {
		t.Fatalf("pre-seed burst counter: %v", err)
	}

	w := sendRequest(r)

	if w.Code != http.StatusTooManyRequests {
		t.Errorf("status = %d; want %d (429)", w.Code, http.StatusTooManyRequests)
	}
	if v := w.Header().Get("Retry-After"); v != "1" {
		t.Errorf("Retry-After = %q; want %q", v, "1")
	}

	var body map[string]interface{}
	if err := json.NewDecoder(w.Body).Decode(&body); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	if body["error"] != "burst rate limit exceeded" {
		t.Errorf("error = %q; want %q", body["error"], "burst rate limit exceeded")
	}
}

// TestRateLimiter_UnknownPlan_DefaultsToFree verifies that a plan name not present
// in PlanLimits falls back to the "free" tier rather than allowing unlimited access.
func TestRateLimiter_UnknownPlan_DefaultsToFree(t *testing.T) {
	client, _ := testRedis(t)
	tenantID := "tenant-unknown-plan"
	// Use a plan name that does not exist in ratelimit.PlanLimits.
	r := rateLimitRouter(t, client, tenantID, "nonexistent")

	limits := ratelimit.PlanLimits["free"]
	ctx := context.Background()

	// Pre-seed minute counter to free-plan limit; next request should be blocked.
	if err := client.Set(ctx, minuteKey(tenantID), limits.RequestsPerMinute, 2*time.Minute).Err(); err != nil {
		t.Fatalf("pre-seed minute counter: %v", err)
	}

	w := sendRequest(r)

	if w.Code != http.StatusTooManyRequests {
		t.Errorf("status = %d; want 429 — unknown plan must default to free-tier limits", w.Code)
	}
}

// TestRateLimiter_UnderLimit_Passes verifies that a tenant below all thresholds
// gets a 200 response with X-RateLimit-Limit and X-RateLimit-Remaining headers set.
func TestRateLimiter_UnderLimit_Passes(t *testing.T) {
	client, _ := testRedis(t)
	r := rateLimitRouter(t, client, "tenant-ok", "free")

	w := sendRequest(r)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d; want 200", w.Code)
	}
	if v := w.Header().Get("X-Ratelimit-Limit"); v == "" {
		t.Error("X-RateLimit-Limit header missing on successful response")
	}
	if v := w.Header().Get("X-Ratelimit-Remaining"); v == "" {
		t.Error("X-RateLimit-Remaining header missing on successful response")
	}
}
