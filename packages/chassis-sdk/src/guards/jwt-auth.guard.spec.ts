import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY, JwtAuthGuard } from './jwt-auth.guard';

function makeContext(headers: Record<string, string>, isPublic = false): ExecutionContext {
  const mockReflector = {
    getAllAndOverride: jest.fn().mockReturnValue(isPublic),
  } as unknown as Reflector;

  const guard = new JwtAuthGuard(mockReflector);

  const request = { headers };
  const context = {
    getHandler: jest.fn().mockReturnValue({}),
    getClass: jest.fn().mockReturnValue({}),
    switchToHttp: jest.fn().mockReturnValue({ getRequest: () => request }),
  } as unknown as ExecutionContext;

  return { guard, context, mockReflector } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  let reflector: Reflector;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;
  });

  describe('@Public() routes', () => {
    it('bypasses auth when isPublic metadata is true', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(true);

      const guard = new JwtAuthGuard(reflector);
      const request = { headers: {} };
      const context = {
        getHandler: jest.fn().mockReturnValue({}),
        getClass: jest.fn().mockReturnValue({}),
        switchToHttp: jest.fn().mockReturnValue({ getRequest: () => request }),
      } as unknown as ExecutionContext;

      const result = guard.canActivate(context);

      expect(result).toBe(true);
      expect(context.switchToHttp).not.toHaveBeenCalled();
    });

    it('checks IS_PUBLIC_KEY on both handler and class', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(false);

      const guard = new JwtAuthGuard(reflector);
      const handlerRef = {};
      const classRef = {};
      const request = { headers: { 'x-user-id': 'user-1' } };
      const context = {
        getHandler: jest.fn().mockReturnValue(handlerRef),
        getClass: jest.fn().mockReturnValue(classRef),
        switchToHttp: jest.fn().mockReturnValue({ getRequest: () => request }),
      } as unknown as ExecutionContext;

      guard.canActivate(context);

      expect(reflector.getAllAndOverride).toHaveBeenCalledWith(IS_PUBLIC_KEY, [
        handlerRef,
        classRef,
      ]);
    });
  });

  describe('missing x-user-id header', () => {
    it('throws UnauthorizedException when header is absent', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(false);

      const guard = new JwtAuthGuard(reflector);
      const request = { headers: {} };
      const context = {
        getHandler: jest.fn().mockReturnValue({}),
        getClass: jest.fn().mockReturnValue({}),
        switchToHttp: jest.fn().mockReturnValue({ getRequest: () => request }),
      } as unknown as ExecutionContext;

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException with expected message', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(false);

      const guard = new JwtAuthGuard(reflector);
      const request = { headers: {} };
      const context = {
        getHandler: jest.fn().mockReturnValue({}),
        getClass: jest.fn().mockReturnValue({}),
        switchToHttp: jest.fn().mockReturnValue({ getRequest: () => request }),
      } as unknown as ExecutionContext;

      expect(() => guard.canActivate(context)).toThrow(
        'Missing gateway identity headers',
      );
    });
  });

  describe('present x-user-id header', () => {
    it('returns true when x-user-id header is present', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(false);

      const guard = new JwtAuthGuard(reflector);
      const request = { headers: { 'x-user-id': 'user-abc-123' } };
      const context = {
        getHandler: jest.fn().mockReturnValue({}),
        getClass: jest.fn().mockReturnValue({}),
        switchToHttp: jest.fn().mockReturnValue({ getRequest: () => request }),
      } as unknown as ExecutionContext;

      const result = guard.canActivate(context);

      expect(result).toBe(true);
    });
  });
});
