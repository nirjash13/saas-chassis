// Package handler_test exercises the HTTP validation and routing layer of
// AuditHandler without requiring a live PostgreSQL connection.
//
// Architecture note: AuditHandler embeds a concrete *repository.AuditRepository
// (not an interface), so tests that require repo interaction (200, 404 paths)
// are implemented as integration tests gated by t.Skip until a test-double seam
// is introduced. Validation paths (400, 401) are fully covered without a DB.
package handler_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/rs/zerolog"
	"github.com/your-org/saas-chassis/audit-service/internal/handler"
	"github.com/your-org/saas-chassis/audit-service/internal/repository"
)

func init() {
	gin.SetMode(gin.TestMode)
}

// newNilRepoHandler constructs an AuditHandler with a nil repository pointer.
// This is safe for tests that only exercise request-validation branches that
// return before any repo method is called.
func newNilRepoHandler() *handler.AuditHandler {
	logger := zerolog.Nop()
	return handler.NewAuditHandler(nil, logger)
}

// testRouter builds a Gin engine with routes mounted from the given handler.
// The callerHeaders map is injected as request headers to simulate gateway auth.
func testRouter(h *handler.AuditHandler) *gin.Engine {
	r := gin.New()
	r.GET("/api/v1/audit/entries", h.ListEntries)
	r.GET("/api/v1/audit/entries/:id", h.GetEntry)
	return r
}

// performRequest executes a GET request against the router and returns the recorder.
func performRequest(r *gin.Engine, path string, headers map[string]string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, path, nil)
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	r.ServeHTTP(w, req)
	return w
}

// authHeaders returns a minimal set of gateway-injected headers for a normal tenant user.
func authHeaders(tenantID string) map[string]string {
	return map[string]string{
		"X-Tenant-ID":         tenantID,
		"X-User-ID":           uuid.New().String(),
		"X-Is-Platform-Admin": "false",
	}
}

// platformAdminHeaders returns headers for a platform administrator with no tenant scope.
func platformAdminHeaders() map[string]string {
	return map[string]string{
		"X-Is-Platform-Admin": "true",
		"X-User-ID":           uuid.New().String(),
	}
}

// decodeBody decodes the JSON response body into a map.
func decodeBody(t *testing.T, w *httptest.ResponseRecorder) map[string]interface{} {
	t.Helper()
	var body map[string]interface{}
	if err := json.NewDecoder(w.Body).Decode(&body); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	return body
}

// ---------------------------------------------------------------------------
// ListEntries — validation paths (no DB required)
// ---------------------------------------------------------------------------

func TestListEntries_MissingAuthHeaders_Returns401(t *testing.T) {
	h := newNilRepoHandler()
	r := testRouter(h)

	// No X-Tenant-ID, no X-Is-Platform-Admin: extractCaller returns false.
	w := performRequest(r, "/api/v1/audit/entries", nil)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("status = %d; want 401", w.Code)
	}
	body := decodeBody(t, w)
	if body["error"] != "unauthorized" {
		t.Errorf("error = %q; want %q", body["error"], "unauthorized")
	}
}

func TestListEntries_MalformedTenantID_Returns400(t *testing.T) {
	h := newNilRepoHandler()
	r := testRouter(h)

	// Valid auth (platform admin) so extractCaller passes, but tenantId query
	// param is not a valid UUID — should return 400.
	w := performRequest(r,
		"/api/v1/audit/entries?tenantId=not-a-uuid",
		platformAdminHeaders(),
	)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d; want 400", w.Code)
	}
	body := decodeBody(t, w)
	if body["error"] != "invalid tenantId format" {
		t.Errorf("error = %q; want %q", body["error"], "invalid tenantId format")
	}
}

func TestListEntries_MalformedUserID_Returns400(t *testing.T) {
	h := newNilRepoHandler()
	r := testRouter(h)

	tenantID := uuid.New().String()
	w := performRequest(r,
		"/api/v1/audit/entries?userId=not-a-uuid",
		authHeaders(tenantID),
	)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d; want 400", w.Code)
	}
	body := decodeBody(t, w)
	if body["error"] != "invalid userId format" {
		t.Errorf("error = %q; want %q", body["error"], "invalid userId format")
	}
}

func TestListEntries_ValidTenantID_Requires_DB(t *testing.T) {
	// This path calls repo.QueryEntries. Without a live DB or a mockable
	// repository interface, we skip here. Wire up a real pool in an
	// integration test environment.
	t.Skip("requires live PostgreSQL; add integration build tag to run")

	tenantID := uuid.New().String()
	_ = tenantID
}

// ---------------------------------------------------------------------------
// GetEntry — validation paths (no DB required)
// ---------------------------------------------------------------------------

func TestGetEntry_MissingAuthHeaders_Returns401(t *testing.T) {
	h := newNilRepoHandler()
	r := testRouter(h)

	w := performRequest(r,
		"/api/v1/audit/entries/"+uuid.New().String(),
		nil,
	)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("status = %d; want 401", w.Code)
	}
}

func TestGetEntry_InvalidUUID_Returns400(t *testing.T) {
	h := newNilRepoHandler()
	r := testRouter(h)

	tenantID := uuid.New().String()
	w := performRequest(r,
		"/api/v1/audit/entries/not-a-uuid",
		authHeaders(tenantID),
	)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d; want 400", w.Code)
	}
	body := decodeBody(t, w)
	if body["error"] != "invalid id format" {
		t.Errorf("error = %q; want %q", body["error"], "invalid id format")
	}
}

func TestGetEntry_ValidUUID_Requires_DB(t *testing.T) {
	// Calls repo.FindByID. Requires integration setup.
	t.Skip("requires live PostgreSQL; add integration build tag to run")
}

func TestGetEntry_NotFound_Requires_DB(t *testing.T) {
	// To exercise the 404 branch (pgx.ErrNoRows from FindByID) we need either
	// a real DB with a known-absent UUID or a test double for AuditRepository.
	// Introduce a repoer interface in the production handler to enable mocking.
	t.Skip("requires live PostgreSQL or repository interface seam; skipping")
}

// ---------------------------------------------------------------------------
// isValidUUID helper — tested via handler behaviour above, but worth an
// explicit coverage note since it is package-private.
// ---------------------------------------------------------------------------

func TestValidUUIDRejection_VariousFormats(t *testing.T) {
	h := newNilRepoHandler()
	r := testRouter(h)

	cases := []struct {
		name   string
		idPath string
	}{
		{"empty-string-segment", "/api/v1/audit/entries/ "},
		{"numeric-only", "/api/v1/audit/entries/12345"},
		{"short-hex", "/api/v1/audit/entries/deadbeef"},
		{"wrong-separator", "/api/v1/audit/entries/550e8400_e29b_41d4_a716_446655440000"},
	}

	tenantID := uuid.New().String()
	headers := authHeaders(tenantID)

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			w := performRequest(r, tc.idPath, headers)
			if w.Code != http.StatusBadRequest {
				t.Errorf("%s: status = %d; want 400", tc.name, w.Code)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// Compile-time verification that NewAuditHandler accepts the concrete repo type.
// This exercises the public constructor signature without running any logic.
// ---------------------------------------------------------------------------

func TestNewAuditHandler_AcceptsConcreteRepo(t *testing.T) {
	// If this compiles, the constructor signature matches expectations.
	// We pass a typed nil pointer — not calling any methods on it.
	var repo *repository.AuditRepository
	logger := zerolog.Nop()
	h := handler.NewAuditHandler(repo, logger)
	if h == nil {
		t.Error("NewAuditHandler returned nil")
	}
}
