package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog"
	"github.com/your-org/saas-chassis/audit-service/internal/config"
	"github.com/your-org/saas-chassis/audit-service/internal/consumer"
	"github.com/your-org/saas-chassis/audit-service/internal/handler"
	"github.com/your-org/saas-chassis/audit-service/internal/healthcheck"
	"github.com/your-org/saas-chassis/audit-service/internal/repository"
)

func main() {
	cfg := config.Load()
	logger := zerolog.New(os.Stdout).With().Timestamp().Logger()

	// PostgreSQL connection pool
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		logger.Fatal().Err(err).Msg("failed to create postgres pool")
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		logger.Fatal().Err(err).Msg("postgres ping failed")
	}
	logger.Info().Msg("connected to postgres")

	repo := repository.NewAuditRepository(pool, logger)

	// Background workers
	go consumer.StartWithReconnect(ctx, cfg.RabbitMQURL, repo, logger)
	go healthcheck.RunHealthChecker(pool, logger)

	// HTTP server
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(func(c *gin.Context) {
		start := time.Now()
		c.Next()
		logger.Info().
			Str("method", c.Request.Method).
			Str("path", c.Request.URL.Path).
			Int("status", c.Writer.Status()).
			Dur("latency", time.Since(start)).
			Str("ip", c.ClientIP()).
			Msg("request")
	})

	r.GET("/health", handler.SelfHealth())

	api := r.Group("/api/v1/audit")
	{
		auditH := handler.NewAuditHandler(repo, logger)
		healthH := handler.NewHealthHandler(repo, logger)

		api.GET("/entries", auditH.ListEntries)
		api.GET("/entries/:id", auditH.GetEntry)
		api.GET("/summary", auditH.GetSummary)
		api.GET("/health", healthH.GetServiceHealth)
	}

	srv := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: r,
	}

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		logger.Info().Str("port", cfg.Port).Msg("audit service started")
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatal().Err(err).Msg("server error")
		}
	}()

	<-quit
	logger.Info().Msg("shutdown signal received")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		logger.Error().Err(err).Msg("graceful shutdown failed")
	}
	logger.Info().Msg("server stopped")
}
