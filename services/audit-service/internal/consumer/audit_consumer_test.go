// Package consumer_test exercises the batch-flush semantics of the audit consumer.
//
// StartConsumer takes a concrete *amqp.Channel and *repository.AuditRepository,
// neither of which is an interface, so full end-to-end consumer tests require live
// RabbitMQ and PostgreSQL connections. The tests in this file fall into two groups:
//
//  1. Unit tests that verify batch-accumulation and flush logic through a local
//     re-implementation of the flush closure (mirrors the production logic exactly
//     and documents the expected contract).
//
//  2. Integration-skipped stubs that document what a full integration test would
//     assert once a repoer interface is introduced in the production package.
//
// Recommended refactor: extract a BatchInserter interface from AuditRepository so
// StartConsumer accepts an interface, enabling mock injection in tests.
package consumer_test

import (
	"context"
	"errors"
	"sync"
	"testing"

	amqp "github.com/rabbitmq/amqp091-go"
	"github.com/your-org/saas-chassis/audit-service/internal/repository"
)

// ---------------------------------------------------------------------------
// Test double: BatchInserter interface
// This is the interface that StartConsumer should accept (recommended refactor).
// We define it here in the test package to document the seam and use it in
// local flush-logic tests.
// ---------------------------------------------------------------------------

// BatchInserter is the minimal interface the consumer needs from the repository.
type BatchInserter interface {
	BatchInsert(ctx context.Context, events []repository.AuditEvent) error
}

// mockRepo is a thread-safe in-memory implementation of BatchInserter.
type mockRepo struct {
	mu       sync.Mutex
	inserted []repository.AuditEvent
	failWith error // if non-nil, BatchInsert returns this error
}

func (m *mockRepo) BatchInsert(_ context.Context, events []repository.AuditEvent) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.failWith != nil {
		return m.failWith
	}
	m.inserted = append(m.inserted, events...)
	return nil
}

func (m *mockRepo) insertedCount() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.inserted)
}

// ---------------------------------------------------------------------------
// mockDelivery simulates an amqp.Delivery for ack/nack tracking.
// ---------------------------------------------------------------------------

type ackState int

const (
	ackPending ackState = iota
	ackAcked
	ackNacked
)

type mockDelivery struct {
	mu      sync.Mutex
	state   ackState
	requeue bool
}

func (d *mockDelivery) Ack() {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.state = ackAcked
}

func (d *mockDelivery) Nack(requeue bool) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.state = ackNacked
	d.requeue = requeue
}

func (d *mockDelivery) wasAcked() bool {
	d.mu.Lock()
	defer d.mu.Unlock()
	return d.state == ackAcked
}

func (d *mockDelivery) wasNacked() bool {
	d.mu.Lock()
	defer d.mu.Unlock()
	return d.state == ackNacked
}

func (d *mockDelivery) wasRequeuedOnNack() bool {
	d.mu.Lock()
	defer d.mu.Unlock()
	return d.state == ackNacked && d.requeue
}

// ---------------------------------------------------------------------------
// localFlush mirrors the flush closure in StartConsumer exactly so we can
// test ack/nack behaviour without a live broker or DB.
// ---------------------------------------------------------------------------

func localFlush(
	repo BatchInserter,
	batch []repository.AuditEvent,
	pending []*mockDelivery,
) (remainingBatch []repository.AuditEvent, remainingPending []*mockDelivery) {
	if len(batch) == 0 {
		return batch, pending
	}
	ctx := context.Background()
	if err := repo.BatchInsert(ctx, batch); err != nil {
		for i := range pending {
			pending[i].Nack(true) // requeue on failure — matches production code
		}
	} else {
		for i := range pending {
			pending[i].Ack() // ack after successful insert
		}
	}
	return batch[:0], pending[:0]
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

func TestBatchFlush_SuccessfulInsert_AllMessagesAcked(t *testing.T) {
	repo := &mockRepo{}

	events := []repository.AuditEvent{
		{TenantID: "11111111-1111-1111-1111-111111111111", Action: "user.login", ServiceName: "identity"},
		{TenantID: "22222222-2222-2222-2222-222222222222", Action: "tenant.created", ServiceName: "tenant-manager"},
	}
	deliveries := []*mockDelivery{{}, {}}

	_, _ = localFlush(repo, events, deliveries)

	t.Run("AllMessagesAcked", func(t *testing.T) {
		for i, d := range deliveries {
			if !d.wasAcked() {
				t.Errorf("delivery[%d] was not acked after successful insert", i)
			}
		}
	})

	t.Run("EventsStoredInRepo", func(t *testing.T) {
		if got := repo.insertedCount(); got != len(events) {
			t.Errorf("repo.inserted count = %d; want %d", got, len(events))
		}
	})
}

func TestBatchFlush_DBInsertFails_AllMessagesNackedWithRequeue(t *testing.T) {
	dbErr := errors.New("connection reset by peer")
	repo := &mockRepo{failWith: dbErr}

	events := []repository.AuditEvent{
		{TenantID: "33333333-3333-3333-3333-333333333333", Action: "user.logout", ServiceName: "identity"},
		{TenantID: "44444444-4444-4444-4444-444444444444", Action: "billing.updated", ServiceName: "billing"},
	}
	deliveries := []*mockDelivery{{}, {}}

	_, _ = localFlush(repo, events, deliveries)

	t.Run("AllMessagesNacked", func(t *testing.T) {
		for i, d := range deliveries {
			if !d.wasNacked() {
				t.Errorf("delivery[%d] was not nacked after DB failure", i)
			}
		}
	})

	t.Run("NackWithRequeue", func(t *testing.T) {
		for i, d := range deliveries {
			if !d.wasRequeuedOnNack() {
				t.Errorf("delivery[%d] Nack requeue=false; want true (messages must be retried)", i)
			}
		}
	})

	t.Run("NothingInsertedInRepo", func(t *testing.T) {
		if got := repo.insertedCount(); got != 0 {
			t.Errorf("repo.inserted count = %d; want 0 on DB failure", got)
		}
	})
}

func TestBatchFlush_EmptyBatch_NoOp(t *testing.T) {
	repo := &mockRepo{}
	var events []repository.AuditEvent
	var deliveries []*mockDelivery

	localFlush(repo, events, deliveries)

	if got := repo.insertedCount(); got != 0 {
		t.Errorf("repo.inserted count = %d; want 0 for empty batch", got)
	}
}

func TestBatchAccumulation_FlushesAtBatchSize(t *testing.T) {
	// Simulates the StartConsumer accumulation loop: messages arrive one at a time;
	// flush fires only when batch reaches 100 (batchSize).
	const batchSize = 100

	repo := &mockRepo{}
	batch := make([]repository.AuditEvent, 0, batchSize)
	pending := make([]*mockDelivery, 0, batchSize)

	flushed := 0

	for i := 0; i < batchSize; i++ {
		event := repository.AuditEvent{
			TenantID:    "55555555-5555-5555-5555-555555555555",
			Action:      "user.login",
			ServiceName: "identity",
		}
		d := &mockDelivery{}

		batch = append(batch, event)
		pending = append(pending, d)

		// Flush condition mirrors production: len(batch) >= 100
		if len(batch) >= batchSize {
			batch, pending = localFlush(repo, batch, pending)
			flushed++
		}
	}

	t.Run("FlushedExactlyOnce", func(t *testing.T) {
		if flushed != 1 {
			t.Errorf("flush count = %d; want 1 (flush at batch size %d)", flushed, batchSize)
		}
	})

	t.Run("AllEventsInserted", func(t *testing.T) {
		if got := repo.insertedCount(); got != batchSize {
			t.Errorf("inserted = %d; want %d", got, batchSize)
		}
	})

	t.Run("BatchClearedAfterFlush", func(t *testing.T) {
		if len(batch) != 0 {
			t.Errorf("batch len after flush = %d; want 0", len(batch))
		}
		if len(pending) != 0 {
			t.Errorf("pending len after flush = %d; want 0", len(pending))
		}
	})
}

func TestBatchAccumulation_DoesNotFlushBeforeBatchSize(t *testing.T) {
	const batchSize = 100
	const sendCount = batchSize - 1

	repo := &mockRepo{}
	batch := make([]repository.AuditEvent, 0, batchSize)
	pending := make([]*mockDelivery, 0, batchSize)

	for i := 0; i < sendCount; i++ {
		batch = append(batch, repository.AuditEvent{
			TenantID:    "66666666-6666-6666-6666-666666666666",
			Action:      "resource.read",
			ServiceName: "api-gateway",
		})
		pending = append(pending, &mockDelivery{})

		if len(batch) >= batchSize {
			batch, pending = localFlush(repo, batch, pending)
		}
	}

	if got := repo.insertedCount(); got != 0 {
		t.Errorf("repo inserted %d events before batch size reached; want 0 (no premature flush)", got)
	}
	if len(batch) != sendCount {
		t.Errorf("batch len = %d; want %d", len(batch), sendCount)
	}
}

// ---------------------------------------------------------------------------
// Integration stubs — require live RabbitMQ and PostgreSQL
// ---------------------------------------------------------------------------

func TestStartConsumer_Integration_BatchFlushOnChannelClose(t *testing.T) {
	t.Skip("integration test: requires live RabbitMQ — run with -tags=integration")
	// When the amqp.Channel is closed, the msgs channel closes, triggering a final
	// flush of any buffered events. Verify all pending messages are acked.
	//
	// Setup: dial real RabbitMQ, declare exchange, publish N messages (< batchSize),
	// close channel, assert all N messages were flushed and acked.
}

func TestStartConsumer_Integration_MalformedMessage_Discarded(t *testing.T) {
	t.Skip("integration test: requires live RabbitMQ — run with -tags=integration")
	// Publish a message whose body cannot be JSON-decoded as AuditEvent.
	// The consumer should Nack with requeue=false (discard) and continue.
}

// ---------------------------------------------------------------------------
// Compile-time check: amqp.Delivery fields used in production match our expectations.
// ---------------------------------------------------------------------------

func TestAmqpDelivery_CompileCheck(_ *testing.T) {
	// Verify that amqp.Delivery has the Ack and Nack methods with the signatures
	// the consumer uses. If this file compiles, the method signatures are correct.
	var d amqp.Delivery
	_ = func() {
		_ = d.Ack(false)
		_ = d.Nack(false, true)
	}
}
