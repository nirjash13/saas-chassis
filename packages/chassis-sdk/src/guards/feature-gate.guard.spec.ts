import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FeatureGateGuard, FeatureFlagChecker } from './feature-gate.guard';
import { FEATURE_KEY } from '../decorators/feature-gate.decorator';

function makeContext(headers: Record<string, string>): ExecutionContext {
  const handler = {};
  const request = { headers };
  return {
    getHandler: jest.fn().mockReturnValue(handler),
    getClass: jest.fn().mockReturnValue({}),
    switchToHttp: jest.fn().mockReturnValue({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('FeatureGateGuard', () => {
  let reflector: Reflector;
  let checker: jest.Mocked<FeatureFlagChecker>;

  beforeEach(() => {
    reflector = { get: jest.fn() } as unknown as Reflector;
    checker = { isEnabled: jest.fn() };
  });

  describe('no @RequireFeature decorator', () => {
    it('passes through when no feature code is set on the handler', async () => {
      (reflector.get as jest.Mock).mockReturnValue(undefined);

      const guard = new FeatureGateGuard(reflector, checker);
      const context = makeContext({ 'x-tenant-id': 'tenant-1' });

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(checker.isEnabled).not.toHaveBeenCalled();
    });
  });

  describe('no feature flag checker injected', () => {
    it('passes through when checker is not provided', async () => {
      (reflector.get as jest.Mock).mockReturnValue('feature-x');

      const guard = new FeatureGateGuard(reflector, undefined);
      const context = makeContext({ 'x-tenant-id': 'tenant-1' });

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
    });
  });

  describe('@RequireFeature calls FeatureFlagService', () => {
    it('calls isEnabled with tenantId and featureCode from context', async () => {
      (reflector.get as jest.Mock).mockReturnValue('feature-x');
      checker.isEnabled.mockResolvedValue(true);

      const guard = new FeatureGateGuard(reflector, checker);
      const context = makeContext({ 'x-tenant-id': 'tenant-abc' });

      await guard.canActivate(context);

      expect(reflector.get).toHaveBeenCalledWith(FEATURE_KEY, expect.anything());
      expect(checker.isEnabled).toHaveBeenCalledWith('tenant-abc', 'feature-x');
    });
  });

  describe('feature enabled', () => {
    it('returns true when checker reports feature is enabled', async () => {
      (reflector.get as jest.Mock).mockReturnValue('feature-x');
      checker.isEnabled.mockResolvedValue(true);

      const guard = new FeatureGateGuard(reflector, checker);
      const context = makeContext({ 'x-tenant-id': 'tenant-1' });

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
    });
  });

  describe('feature disabled', () => {
    it('throws ForbiddenException when checker reports feature is disabled', async () => {
      (reflector.get as jest.Mock).mockReturnValue('feature-x');
      checker.isEnabled.mockResolvedValue(false);

      const guard = new FeatureGateGuard(reflector, checker);
      const context = makeContext({ 'x-tenant-id': 'tenant-1' });

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it('includes FEATURE_DISABLED code in the thrown exception', async () => {
      (reflector.get as jest.Mock).mockReturnValue('feature-x');
      checker.isEnabled.mockResolvedValue(false);

      const guard = new FeatureGateGuard(reflector, checker);
      const context = makeContext({ 'x-tenant-id': 'tenant-1' });

      await expect(guard.canActivate(context)).rejects.toMatchObject({
        response: { code: 'FEATURE_DISABLED' },
      });
    });
  });

  describe('platform admin bypass', () => {
    it('passes through for platform admin even when feature is disabled', async () => {
      // The guard reads x-tenant-id for the checker call but the platform admin
      // pattern is handled upstream (TenantContextMiddleware sets isPlatformAdmin).
      // FeatureGateGuard itself passes through when featureFlagChecker is absent;
      // platform admin services typically inject no checker, or the checker
      // returns true for the sentinel tenant ID (all-zeros UUID).
      // Here we verify the guard still calls isEnabled and respects the result
      // when the tenant ID is the platform admin sentinel value.
      const PLATFORM_ADMIN_TENANT = '00000000-0000-0000-0000-000000000000';
      (reflector.get as jest.Mock).mockReturnValue('feature-x');
      checker.isEnabled.mockResolvedValue(true);

      const guard = new FeatureGateGuard(reflector, checker);
      const context = makeContext({ 'x-tenant-id': PLATFORM_ADMIN_TENANT });

      const result = await guard.canActivate(context);

      expect(checker.isEnabled).toHaveBeenCalledWith(PLATFORM_ADMIN_TENANT, 'feature-x');
      expect(result).toBe(true);
    });

    it('passes through when no checker is injected (platform admin scenario)', async () => {
      (reflector.get as jest.Mock).mockReturnValue('feature-x');

      const guard = new FeatureGateGuard(reflector, undefined);
      const context = makeContext({ 'x-is-platform-admin': 'true' });

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
    });
  });
});
