package database

import (
	"context"
	"testing"
)

func TestWithTenantContext(t *testing.T) {
	ctx := context.Background()
	tc := TenantContext{
		TenantID:        "test-tenant-id",
		UserID:          "test-user-id",
		IsPlatformAdmin: false,
	}

	ctx = WithTenantContext(ctx, tc)
	got, ok := GetTenantContext(ctx)
	if !ok {
		t.Fatal("expected tenant context to be present")
	}
	if got.TenantID != tc.TenantID {
		t.Errorf("got TenantID=%q, want %q", got.TenantID, tc.TenantID)
	}
	if got.UserID != tc.UserID {
		t.Errorf("got UserID=%q, want %q", got.UserID, tc.UserID)
	}
	if got.IsPlatformAdmin != tc.IsPlatformAdmin {
		t.Errorf("got IsPlatformAdmin=%v, want %v", got.IsPlatformAdmin, tc.IsPlatformAdmin)
	}
}

func TestGetTenantContext_Missing(t *testing.T) {
	ctx := context.Background()
	_, ok := GetTenantContext(ctx)
	if ok {
		t.Fatal("expected no tenant context")
	}
}
