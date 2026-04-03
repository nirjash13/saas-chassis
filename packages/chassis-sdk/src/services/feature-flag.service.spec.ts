import { FeatureFlagService } from './feature-flag.service';
import { ChassisOptions } from '../config/chassis.config';

const BASE_OPTIONS: ChassisOptions = {
  serviceName: 'test-service',
  tenantManagerUrl: 'http://tenant-manager',
  serviceToken: 'svc-token',
  enableFeatureGating: true,
};

function makeService(options?: Partial<ChassisOptions>): FeatureFlagService {
  const merged = options !== undefined ? { ...BASE_OPTIONS, ...options } : BASE_OPTIONS;
  return new FeatureFlagService(merged);
}

function mockFetch(response: { ok: boolean; status?: number; body?: unknown }): jest.SpyInstance {
  return jest.spyOn(global, 'fetch').mockResolvedValue({
    ok: response.ok,
    status: response.status ?? 200,
    json: jest.fn().mockResolvedValue(response.body ?? {}),
  } as unknown as Response);
}

describe('FeatureFlagService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  describe('feature gating disabled or missing config', () => {
    it('returns true when enableFeatureGating is false', async () => {
      const service = makeService({ enableFeatureGating: false });
      jest.spyOn(global, 'fetch');

      const result = await service.isEnabled('tenant-1', 'feature-x');

      expect(result).toBe(true);
      expect(fetch).not.toHaveBeenCalled();
    });

    it('returns true when tenantManagerUrl is not set', async () => {
      const service = makeService({ tenantManagerUrl: undefined });
      jest.spyOn(global, 'fetch');

      const result = await service.isEnabled('tenant-1', 'feature-x');

      expect(result).toBe(true);
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe('cache hit', () => {
    it('returns cached value without making an HTTP call on second request', async () => {
      const fetchSpy = mockFetch({
        ok: true,
        body: { data: { isEnabled: true } },
      });

      const service = makeService();

      // First call — populates cache
      await service.isEnabled('tenant-1', 'feature-x');
      // Second call — should hit cache
      const result = await service.isEnabled('tenant-1', 'feature-x');

      expect(result).toBe(true);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('returns false from cache when feature was cached as disabled', async () => {
      mockFetch({ ok: true, body: { data: { isEnabled: false } } });

      const service = makeService();
      await service.isEnabled('tenant-1', 'feature-y');
      const result = await service.isEnabled('tenant-1', 'feature-y');

      expect(result).toBe(false);
    });
  });

  describe('cache miss', () => {
    it('calls the tenant manager HTTP endpoint on cache miss', async () => {
      const fetchSpy = mockFetch({
        ok: true,
        body: { data: { isEnabled: true } },
      });

      const service = makeService();
      await service.isEnabled('tenant-abc', 'billing-v2');

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(
        'http://tenant-manager/api/v1/tenants/tenant-abc/features/billing-v2',
      );
    });

    it('caches the result after a successful HTTP call', async () => {
      const fetchSpy = mockFetch({
        ok: true,
        body: { data: { isEnabled: true } },
      });

      const service = makeService();
      await service.isEnabled('tenant-1', 'feature-z');
      await service.isEnabled('tenant-1', 'feature-z');

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('sends the service token in request headers', async () => {
      const fetchSpy = mockFetch({
        ok: true,
        body: { data: { isEnabled: true } },
      });

      const service = makeService({ serviceToken: 'my-token' });
      await service.isEnabled('tenant-1', 'feature-x');

      const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect((init.headers as Record<string, string>)['X-Service-Token']).toBe('my-token');
    });
  });

  describe('unknown / missing feature', () => {
    it('returns false when the response body has no isEnabled field', async () => {
      mockFetch({ ok: true, body: { data: {} } });

      const service = makeService();
      const result = await service.isEnabled('tenant-1', 'unknown-feature');

      expect(result).toBe(false);
    });

    it('returns false when the response body is empty', async () => {
      mockFetch({ ok: true, body: {} });

      const service = makeService();
      const result = await service.isEnabled('tenant-1', 'unknown-feature');

      expect(result).toBe(false);
    });

    it('returns false when HTTP response is not ok', async () => {
      mockFetch({ ok: false, status: 404 });

      const service = makeService();
      const result = await service.isEnabled('tenant-1', 'feature-x');

      expect(result).toBe(false);
    });

    it('returns false when fetch throws (network error)', async () => {
      jest.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'));

      const service = makeService();
      const result = await service.isEnabled('tenant-1', 'feature-x');

      expect(result).toBe(false);
    });
  });

  describe('cache eviction (SDK-7 fix)', () => {
    it('evicts the oldest entry when cache exceeds 1000 items', async () => {
      // Fill cache to capacity with unique tenant/feature pairs
      const fetchSpy = mockFetch({
        ok: true,
        body: { data: { isEnabled: true } },
      });

      const service = makeService();

      // Populate 1000 entries — each unique key triggers a fetch
      for (let i = 0; i < 1000; i++) {
        mockFetch({ ok: true, body: { data: { isEnabled: true } } });
        await service.isEnabled(`tenant-${i}`, 'feature-x');
      }

      fetchSpy.mockRestore();

      // Adding entry 1001 should evict the oldest ('tenant-0:feature-x')
      const spy1001 = mockFetch({ ok: true, body: { data: { isEnabled: false } } });
      await service.isEnabled('tenant-NEW', 'feature-x');

      // Now re-request tenant-0 — it must have been evicted, so a new fetch occurs
      const spyEvicted = mockFetch({ ok: true, body: { data: { isEnabled: true } } });
      await service.isEnabled('tenant-0', 'feature-x');

      expect(spyEvicted).toHaveBeenCalledTimes(1);

      spy1001.mockRestore();
      spyEvicted.mockRestore();
    });

    it('does not grow cache beyond 1000 entries', async () => {
      const service = makeService();

      // Accessing private cache for assertion — cast through unknown
      const privateService = service as unknown as { cache: Map<string, unknown> };

      for (let i = 0; i < 1010; i++) {
        mockFetch({ ok: true, body: { data: { isEnabled: true } } });
        await service.isEnabled(`t-${i}`, 'feat');
        jest.restoreAllMocks();
      }

      expect(privateService.cache.size).toBeLessThanOrEqual(1000);
    });
  });
});
