import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { StripeWebhookController } from './stripe-webhook.controller';
import { StripeService } from './stripe.service';
import { WebhookEvent } from './entities/webhook-event.entity';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { InvoicesService } from '../invoices/invoices.service';
import { RabbitMqPublisherService } from '../../common/messaging/rabbitmq-publisher.service';

const mockWebhookRepo = {
  findOne: jest.fn(),
  upsert: jest.fn(),
  update: jest.fn(),
};

const mockSubscriptionsService = {
  findByStripeCustomerId: jest.fn(),
  create: jest.fn(),
  linkStripeSubscription: jest.fn(),
  updateFromStripe: jest.fn(),
  updateStatusByTenantId: jest.fn(),
};

const mockInvoicesService = {
  upsertFromStripe: jest.fn(),
};

const mockStripeService = {
  constructWebhookEvent: jest.fn(),
  createCustomer: jest.fn(),
};

const mockConfigService = {
  get: jest.fn().mockReturnValue('test-secret'),
};

const mockRabbitMqPublisher = {
  publish: jest.fn(),
};

describe('StripeWebhookController', () => {
  let controller: StripeWebhookController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StripeWebhookController],
      providers: [
        { provide: StripeService, useValue: mockStripeService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: SubscriptionsService, useValue: mockSubscriptionsService },
        { provide: InvoicesService, useValue: mockInvoicesService },
        { provide: getRepositoryToken(WebhookEvent), useValue: mockWebhookRepo },
        { provide: RabbitMqPublisherService, useValue: mockRabbitMqPublisher },
      ],
    }).compile();

    controller = module.get<StripeWebhookController>(StripeWebhookController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('handleWebhook', () => {
    it('returns 400 when signature verification fails', async () => {
      mockStripeService.constructWebhookEvent.mockImplementation(() => {
        throw new Error('No matching signatures found');
      });

      const mockReq = {
        headers: { 'stripe-signature': 'bad-sig' },
        rawBody: Buffer.from('{}'),
      };
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
        json: jest.fn(),
      };

      await controller.handleWebhook(mockReq as any, mockRes as any);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.send).toHaveBeenCalledWith('Webhook signature verification failed');
    });

    it('returns 200 with duplicate flag for already-processed events', async () => {
      const fakeEvent = { id: 'evt_123', type: 'customer.created', data: { object: {} } };
      mockStripeService.constructWebhookEvent.mockReturnValue(fakeEvent);
      mockWebhookRepo.findOne.mockResolvedValue({ processed: true });

      const mockReq = {
        headers: { 'stripe-signature': 'valid-sig' },
        rawBody: Buffer.from('{}'),
      };
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await controller.handleWebhook(mockReq as any, mockRes as any);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({ received: true, duplicate: true });
      expect(mockWebhookRepo.upsert).not.toHaveBeenCalled();
    });

    it('processes a new event and marks it processed', async () => {
      const fakeEvent = { id: 'evt_456', type: 'customer.created', data: { object: {} } };
      mockStripeService.constructWebhookEvent.mockReturnValue(fakeEvent);
      mockWebhookRepo.findOne.mockResolvedValue(null);
      mockWebhookRepo.upsert.mockResolvedValue(undefined);
      mockWebhookRepo.update.mockResolvedValue(undefined);

      const mockReq = {
        headers: { 'stripe-signature': 'valid-sig' },
        rawBody: Buffer.from('{}'),
      };
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await controller.handleWebhook(mockReq as any, mockRes as any);

      expect(mockWebhookRepo.upsert).toHaveBeenCalled();
      expect(mockWebhookRepo.update).toHaveBeenCalledWith(
        { stripeEventId: 'evt_456' },
        expect.objectContaining({ processed: true }),
      );
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({ received: true });
    });
  });

  describe('onTenantProvisioned', () => {
    it('creates a Stripe customer and subscription', async () => {
      mockStripeService.createCustomer.mockResolvedValue({ id: 'cus_abc123' });
      mockSubscriptionsService.create.mockResolvedValue({});

      await controller.onTenantProvisioned({
        tenantId: 'tenant-uuid',
        slug: 'acme',
        plan: 'free',
        adminEmail: 'admin@acme.com',
      });

      expect(mockStripeService.createCustomer).toHaveBeenCalledWith({
        email: 'admin@acme.com',
        name: 'acme',
        tenantId: 'tenant-uuid',
      });

      expect(mockSubscriptionsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-uuid',
          stripeCustomerId: 'cus_abc123',
          planCode: 'free',
          status: 'active',
        }),
      );

      expect(mockRabbitMqPublisher.publish).toHaveBeenCalledWith(
        'chassis.tenants',
        'billing.synced',
        expect.objectContaining({ tenantId: 'tenant-uuid', stripeCustomerId: 'cus_abc123' }),
      );
    });

    it('sets status to trialing for non-free plans', async () => {
      mockStripeService.createCustomer.mockResolvedValue({ id: 'cus_pro123' });
      mockSubscriptionsService.create.mockResolvedValue({});

      await controller.onTenantProvisioned({
        tenantId: 'tenant-uuid',
        slug: 'acme',
        plan: 'pro',
        adminEmail: 'admin@acme.com',
      });

      expect(mockSubscriptionsService.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'trialing' }),
      );
    });
  });
});
