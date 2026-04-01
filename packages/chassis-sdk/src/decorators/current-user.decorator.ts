import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface UserContext {
  userId: string;
  email: string;
  displayName: string;
  isPlatformAdmin: boolean;
  isImpersonating: boolean;
  realUserId?: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UserContext => {
    const request = ctx.switchToHttp().getRequest();
    return {
      userId: request.headers['x-user-id'] as string,
      email: request.user?.email || '',
      displayName: request.user?.displayName || '',
      isPlatformAdmin: request.headers['x-is-platform-admin'] === 'true',
      isImpersonating: request.headers['x-is-impersonating'] === 'true',
      realUserId: request.headers['x-real-user-id'] as string | undefined,
    };
  },
);
