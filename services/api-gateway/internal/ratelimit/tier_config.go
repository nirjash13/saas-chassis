package ratelimit

// TierLimits holds per-plan rate limit thresholds.
type TierLimits struct {
	RequestsPerMinute int
	RequestsPerHour   int
	BurstSize         int
}

// PlanLimits maps plan name to its rate limit configuration.
var PlanLimits = map[string]TierLimits{
	"free":       {RequestsPerMinute: 30, RequestsPerHour: 500, BurstSize: 10},
	"starter":    {RequestsPerMinute: 100, RequestsPerHour: 3000, BurstSize: 30},
	"pro":        {RequestsPerMinute: 500, RequestsPerHour: 15000, BurstSize: 100},
	"enterprise": {RequestsPerMinute: 2000, RequestsPerHour: 100000, BurstSize: 500},
}
