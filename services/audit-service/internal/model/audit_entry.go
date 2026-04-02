package model

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// AuditEntry is a row in audit.entries.
type AuditEntry struct {
	ID           uuid.UUID       `json:"id"`
	TenantID     uuid.UUID       `json:"tenantId"`
	UserID       *uuid.UUID      `json:"userId,omitempty"`
	Action       string          `json:"action"`
	ResourceType string          `json:"resourceType"`
	ResourceID   *string         `json:"resourceId,omitempty"`
	Description  *string         `json:"description,omitempty"`
	Changes      json.RawMessage `json:"changes,omitempty"`
	Metadata     json.RawMessage `json:"metadata,omitempty"`
	IPAddress    *string         `json:"ipAddress,omitempty"`
	UserAgent    *string         `json:"userAgent,omitempty"`
	RequestID    *uuid.UUID      `json:"requestId,omitempty"`
	ServiceName  *string         `json:"serviceName,omitempty"`
	CreatedAt    time.Time       `json:"createdAt"`
}

// ServiceHealth is a row in audit.service_health.
type ServiceHealth struct {
	ID             uuid.UUID       `json:"id"`
	ServiceName    string          `json:"serviceName"`
	Status         string          `json:"status"`
	ResponseTimeMs *int32          `json:"responseTimeMs,omitempty"`
	Details        json.RawMessage `json:"details,omitempty"`
	CheckedAt      time.Time       `json:"checkedAt"`
}

// AuditSummary is aggregated stats returned by GET /audit/summary.
type AuditSummary struct {
	TotalEntries int64            `json:"totalEntries"`
	ByAction     map[string]int64 `json:"byAction"`
	ByService    map[string]int64 `json:"byService"`
	Last24Hours  int64            `json:"last24Hours"`
}
