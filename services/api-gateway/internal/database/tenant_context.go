package database

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// TenantContext carries tenant identity through Go request context.
type TenantContext struct {
	TenantID        string
	UserID          string
	IsPlatformAdmin bool
}

type contextKey string

const tenantCtxKey contextKey = "tenant_ctx"

// WithTenantContext stores tenant context in the Go context.
func WithTenantContext(ctx context.Context, tc TenantContext) context.Context {
	return context.WithValue(ctx, tenantCtxKey, tc)
}

// GetTenantContext retrieves tenant context from the Go context.
func GetTenantContext(ctx context.Context) (TenantContext, bool) {
	tc, ok := ctx.Value(tenantCtxKey).(TenantContext)
	return tc, ok
}

// ExecuteWithRLS wraps a database operation with tenant RLS context.
// Uses SET LOCAL so context is scoped to the transaction only.
func ExecuteWithRLS(ctx context.Context, pool *pgxpool.Pool, fn func(tx pgx.Tx) error) error {
	tc, ok := GetTenantContext(ctx)
	if !ok {
		return fmt.Errorf("no tenant context in request")
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin transaction: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	_, err = tx.Exec(ctx, "SET LOCAL app.current_tenant_id = $1", tc.TenantID)
	if err != nil {
		return fmt.Errorf("set tenant id: %w", err)
	}
	_, err = tx.Exec(ctx, "SET LOCAL app.is_platform_admin = $1", fmt.Sprintf("%t", tc.IsPlatformAdmin))
	if err != nil {
		return fmt.Errorf("set platform admin: %w", err)
	}

	if err := fn(tx); err != nil {
		return err
	}

	return tx.Commit(ctx)
}
