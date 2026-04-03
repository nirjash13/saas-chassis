package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"
	"github.com/your-org/saas-chassis/api-gateway/internal/config"
	"github.com/your-org/saas-chassis/api-gateway/internal/middleware"
	"github.com/your-org/saas-chassis/api-gateway/internal/proxy"
)

func main() {
	cfg := config.Load()

	if cfg.JWTSecret == "" {
		fmt.Fprintf(os.Stderr, "JWT_SECRET environment variable is required and cannot be empty\n")
		os.Exit(1)
	}

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

	// Start server with graceful shutdown
	srv := &http.Server{
		Addr:    fmt.Sprintf(":%s", cfg.Port),
		Handler: r,
	}

	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatal().Err(err).Msg("Server error")
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info().Msg("Shutting down server...")
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		logger.Fatal().Err(err).Msg("Server forced to shutdown")
	}
	logger.Info().Msg("Server stopped")
}
