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
	amqp "github.com/rabbitmq/amqp091-go"
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

	// RabbitMQ connection
	conn, err := amqp.Dial(cfg.RabbitMQURL)
	if err != nil {
		logger.Fatal().Err(err).Msg("failed to connect to rabbitmq")
	}
	defer conn.Close()

	ch, err := conn.Channel()
	if err != nil {
		logger.Fatal().Err(err).Msg("failed to open rabbitmq channel")
	}
	defer ch.Close()

	// Prefetch up to 100 messages before requiring acks
	if err := ch.Qos(100, 0, false); err != nil {
		logger.Fatal().Err(err).Msg("failed to set channel QoS")
	}

	if err := consumer.Setup(ch); err != nil {
		logger.Fatal().Err(err).Msg("failed to setup rabbitmq topology")
	}
	logger.Info().Msg("connected to rabbitmq")

	repo := repository.NewAuditRepository(pool, logger)

	// Background workers
	go consumer.StartConsumer(ch, repo, logger)
	go healthcheck.RunHealthChecker(pool, logger)

	// HTTP server
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Recovery())

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
