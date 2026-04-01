import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Optional,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FEATURE_KEY } from '../decorators/feature-gate.decorator';

export interface FeatureFlagChecker {
  isEnabled(tenantId: string, featureCode: string): Promise<boolean>;
}

@Injectable()
export class FeatureGateGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @Optional()
    @Inject('FEATURE_FLAG_CHECKER')
    private featureFlagChecker?: FeatureFlagChecker,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const featureCode = this.reflector.get<string>(
      FEATURE_KEY,
      context.getHandler(),
    );
    if (!featureCode) return true;
    if (!this.featureFlagChecker) return true;

    const req = context.switchToHttp().getRequest();
    const tenantId = req.headers['x-tenant-id'] as string;

    const enabled = await this.featureFlagChecker.isEnabled(
      tenantId,
      featureCode,
    );
    if (!enabled) {
      throw new ForbiddenException({
        code: 'FEATURE_DISABLED',
        message: `Feature '${featureCode}' is not enabled for this tenant`,
      });
    }
    return true;
  }
}
