package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

// Claims is the typed JWT claims struct used by the gateway.
type Claims struct {
	UserID          string   `json:"sub"`
	TenantID        string   `json:"tenant_id"`
	TenantSlug      string   `json:"tenant_slug"`
	Roles           []string `json:"roles"`
	Permissions     []string `json:"permissions"`
	IsPlatformAdmin bool     `json:"is_platform_admin"`
	IsImpersonating bool     `json:"is_impersonating"`
	RealUserID      string   `json:"real_user_id,omitempty"`
	Plan            string   `json:"plan"`
	jwt.RegisteredClaims
}

// AuthMiddleware validates the Bearer JWT and injects X- headers for downstream services.
func AuthMiddleware(jwtSecret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing authorization header"})
			return
		}

		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid authorization header format"})
			return
		}
		tokenString := parts[1]

		claims := &Claims{}
		token, err := jwt.ParseWithClaims(tokenString, claims, func(t *jwt.Token) (interface{}, error) {
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, jwt.ErrSignatureInvalid
			}
			return []byte(jwtSecret), nil
		})
		if err != nil || !token.Valid {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired token"})
			return
		}

		// Inject identity headers for downstream services
		c.Request.Header.Set("X-User-ID", claims.UserID)
		c.Request.Header.Set("X-Tenant-ID", claims.TenantID)
		c.Request.Header.Set("X-Tenant-Slug", claims.TenantSlug)
		c.Request.Header.Set("X-Roles", strings.Join(claims.Roles, ","))
		c.Request.Header.Set("X-Permissions", strings.Join(claims.Permissions, ","))

		isPlatformAdmin := "false"
		if claims.IsPlatformAdmin {
			isPlatformAdmin = "true"
		}
		c.Request.Header.Set("X-Is-Platform-Admin", isPlatformAdmin)

		isImpersonating := "false"
		if claims.IsImpersonating {
			isImpersonating = "true"
			c.Request.Header.Set("X-Real-User-ID", claims.RealUserID)
		}
		c.Request.Header.Set("X-Is-Impersonating", isImpersonating)

		c.Set("claims", claims)
		c.Set("tenant_plan", claims.Plan)

		c.Next()
	}
}
