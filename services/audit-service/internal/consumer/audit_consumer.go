package consumer

import (
	"context"
	"encoding/json"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
	"github.com/rs/zerolog"
	"github.com/your-org/saas-chassis/audit-service/internal/repository"
)

// StartWithReconnect runs StartConsumer in a loop, reconnecting on failure.
// It dials a fresh AMQP connection and channel on each attempt so that a
// broker restart or network blip is recovered automatically.
func StartWithReconnect(ctx context.Context, rabbitURL string, repo *repository.AuditRepository, logger zerolog.Logger) {
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		conn, err := amqp.Dial(rabbitURL)
		if err != nil {
			logger.Error().Err(err).Msg("rabbitmq dial failed, retrying in 5s")
			select {
			case <-time.After(5 * time.Second):
			case <-ctx.Done():
				return
			}
			continue
		}

		ch, err := conn.Channel()
		if err != nil {
			conn.Close()
			logger.Error().Err(err).Msg("rabbitmq channel open failed, retrying in 5s")
			select {
			case <-time.After(5 * time.Second):
			case <-ctx.Done():
				return
			}
			continue
		}

		if err := ch.Qos(100, 0, false); err != nil {
			ch.Close()
			conn.Close()
			logger.Error().Err(err).Msg("rabbitmq QoS failed, retrying in 5s")
			select {
			case <-time.After(5 * time.Second):
			case <-ctx.Done():
				return
			}
			continue
		}

		if err := Setup(ch); err != nil {
			ch.Close()
			conn.Close()
			logger.Error().Err(err).Msg("rabbitmq topology setup failed, retrying in 5s")
			select {
			case <-time.After(5 * time.Second):
			case <-ctx.Done():
				return
			}
			continue
		}

		logger.Info().Msg("rabbitmq connection established")

		// StartConsumer blocks until the channel closes.
		StartConsumer(ch, repo, logger)

		ch.Close()
		conn.Close()

		// Channel was closed — check if shutdown was requested.
		select {
		case <-ctx.Done():
			return
		default:
		}

		logger.Error().Msg("rabbitmq consumer exited, reconnecting in 5s")
		select {
		case <-time.After(5 * time.Second):
		case <-ctx.Done():
			return
		}
	}
}

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
	pending := make([]amqp.Delivery, 0, 100)
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
			for i := range pending {
				pending[i].Nack(false, true) // requeue on failure
			}
		} else {
			for i := range pending {
				pending[i].Ack(false) // ack only after successful insert
			}
		}
		batch = batch[:0]
		pending = pending[:0]
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
			pending = append(pending, msg)

			if len(batch) >= 100 {
				flush()
			}

		case <-ticker.C:
			flush()
		}
	}
}
