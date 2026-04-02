package proxy

import (
	"encoding/json"
	"net/http"
	"net/http/httputil"
	"net/url"

	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog"
)

func proxyTo(targetBase string, logger zerolog.Logger) gin.HandlerFunc {
	targetURL, err := url.Parse(targetBase)
	if err != nil {
		panic("invalid proxy target: " + targetBase)
	}
	proxy := httputil.NewSingleHostReverseProxy(targetURL)

	proxy.Director = func(req *http.Request) {
		req.URL.Scheme = targetURL.Scheme
		req.URL.Host = targetURL.Host
		req.Host = targetURL.Host
		// strip the /api/v1 prefix so backend sees clean paths
		// X- headers already injected by auth middleware
	}

	proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		logger.Error().Err(err).Str("target", targetBase).Msg("proxy error")
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadGateway)
		json.NewEncoder(w).Encode(map[string]string{ //nolint:errcheck
			"error": "service unavailable",
			"code":  "UPSTREAM_ERROR",
		})
	}

	return func(c *gin.Context) {
		proxy.ServeHTTP(c.Writer, c.Request)
	}
}
