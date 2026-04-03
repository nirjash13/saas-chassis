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
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"
	"github.com/your-org/saas-chassis/api-gateway/internal/config"
	"github.com/your-org/saas-chassis/api-gateway/internal/metering"
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

	// PostgreSQL connection pool for metering flush (optional — skipped when DATABASE_URL is empty)
	var dbPool *pgxpool.Pool
	if cfg.DatabaseURL != "" {
		dbPool, err = pgxpool.New(context.Background(), cfg.DatabaseURL)
		if err != nil {
			logger.Fatal().Err(err).Msg("failed to connect to PostgreSQL")
		}
		defer dbPool.Close()
	} else {
		logger.Warn().Msg("DATABASE_URL not set; metering flush to PostgreSQL is disabled")
	}

	// Gin engine (no default middleware)
	r := gin.New()

	// Global middleware
	r.Use(middleware.RecoveryMiddleware(logger))
	r.Use(middleware.RequestIDMiddleware())
	r.Use(middleware.CORSMiddleware())

	// Routes
	proxy.SetupRoutes(r, cfg, redisClient, logger)

	// Root context cancelled on shutdown signal — shared by background workers.
	rootCtx, rootCancel := context.WithCancel(context.Background())
	defer rootCancel()

	// Start metering flusher if PostgreSQL is available.
	if dbPool != nil {
		flusher := metering.NewFlusher(dbPool, redisClient, logger)
		go flusher.Start(rootCtx)
		logger.Info().Msg("metering flusher started (interval: 5m)")
	}

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
	// Cancel root context to stop background workers (metering flusher, etc.).
	rootCancel()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		logger.Fatal().Err(err).Msg("Server forced to shutdown")
	}
	logger.Info().Msg("Server stopped")
}
