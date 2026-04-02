package consumer

import (
	"context"
	"encoding/json"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
	"github.com/rs/zerolog"
	"github.com/your-org/saas-chassis/audit-service/internal/repository"
)

// Setup declares the chassis.audit fanout exchange and binds the audit.log-entry queue.
func Setup(ch *amqp.Channel) error {
	if err := ch.ExchangeDeclare(
		"chassis.audit",
		"fanout",
		true,  // durable
		false, // auto-delete
		false, // internal
		false, // no-wait
		nil,
	); err != nil {
		return err
	}

	q, err := ch.QueueDeclare(
		"audit.log-entry",
		true,  // durable
		false, // auto-delete
		false, // exclusive
		false, // no-wait
		nil,
	)
	if err != nil {
		return err
	}

	return ch.QueueBind(q.Name, "", "chassis.audit", false, nil)
}

// StartConsumer listens on audit.log-entry and batch-inserts events into PostgreSQL.
// Flushes when the batch reaches 100 events or every 5 seconds, whichever comes first.
func StartConsumer(ch *amqp.Channel, repo *repository.AuditRepository, logger zerolog.Logger) {
	msgs, err := ch.Consume("audit.log-entry", "", false, false, false, false, nil)
	if err != nil {
		logger.Fatal().Err(err).Msg("failed to start audit consumer")
		return
	}

	batch := make([]repository.AuditEvent, 0, 100)
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	flush := func() {
		if len(batch) == 0 {
			return
		}
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		if err := repo.BatchInsert(ctx, batch); err != nil {
			logger.Error().Err(err).Int("count", len(batch)).Msg("audit batch insert failed")
		}
		batch = batch[:0]
	}

	logger.Info().Msg("audit consumer started")

	for {
		select {
		case msg, ok := <-msgs:
			if !ok {
				flush()
				logger.Info().Msg("audit consumer channel closed")
				return
			}

			var event repository.AuditEvent
			if err := json.Unmarshal(msg.Body, &event); err != nil {
				logger.Warn().Err(err).Msg("discarding malformed audit event")
				msg.Nack(false, false) // discard — do not requeue
				continue
			}

			batch = append(batch, event)
			msg.Ack(false)

			if len(batch) >= 100 {
				flush()
			}

		case <-ticker.C:
			flush()
		}
	}
}
