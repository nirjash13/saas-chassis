package main

import (
	"os"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"
	"github.com/your-org/saas-chassis/api-gateway/internal/config"
	"github.com/your-org/saas-chassis/api-gateway/internal/middleware"
	"github.com/your-org/saas-chassis/api-gateway/internal/proxy"
)

func main() {
	cfg := config.Load()

	// Redis client
	redisOpts, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		panic("invalid REDIS_URL: " + err.Error())
	}
	redisClient := redis.NewClient(redisOpts)

	// Structured JSON logger
	logger := zerolog.New(os.Stdout).With().Timestamp().Logger()

	// Gin engine (no default middleware)
	r := gin.New()

	// Global middleware
	r.Use(middleware.RecoveryMiddleware(logger))
	r.Use(middleware.RequestIDMiddleware())
	r.Use(middleware.CORSMiddleware())

	// Routes
	proxy.SetupRoutes(r, cfg, redisClient, logger)

	// Start server
	if err := r.Run(":" + cfg.Port); err != nil {
		logger.Fatal().Err(err).Msg("server failed to start")
	}
}
