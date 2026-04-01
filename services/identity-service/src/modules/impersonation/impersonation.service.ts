import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { ClientProxy } from '@nestjs/microservices';
import { createHash } from 'crypto';
import { ImpersonationSession } from './entities/impersonation-session.entity';
import { ImpersonateDto } from './dto/impersonate.dto';
import { AuthService } from '../auth/auth.service';
import { UsersService } from '../users/users.service';
import { AccessTokenResponseDto } from '../auth/dto/token-response.dto';
import { JwtPayload } from '../auth/strategies/jwt.strategy';

@Injectable()
export class ImpersonationService {
  private readonly logger = new Logger(ImpersonationService.name);

  constructor(
    @InjectRepository(ImpersonationSession)
    private readonly sessionsRepository: Repository<ImpersonationSession>,
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    @Optional() @Inject('RABBITMQ_CLIENT') private readonly client: ClientProxy | null,
  ) {}

  async startImpersonation(
    adminUser: JwtPayload,
    dto: ImpersonateDto,
  ): Promise<{ accessToken: string; sessionId: string }> {
    // Only platform admins can impersonate
    if (!adminUser.isPlatformAdmin) {
      throw new ForbiddenException('Only platform administrators can impersonate users');
    }

    const admin = await this.usersService.findById(adminUser.sub);
    const targetUser = await this.usersService.findById(dto.targetUserId);

    if (!targetUser.isActive) {
      throw new ForbiddenException('Cannot impersonate an inactive user');
    }

    if (targetUser.isPlatformAdmin) {
      throw new ForbiddenException('Cannot impersonate another platform administrator');
    }

    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    // Create a placeholder session first to get the ID
    const session = this.sessionsRepository.create({
      adminUserId: admin.id,
      targetUserId: targetUser.id,
      targetTenantId: dto.targetTenantId,
      reason: dto.reason,
      tokenHash: 'pending',
      expiresAt,
    });

    const savedSession = await this.sessionsRepository.save(session);

    // Issue the impersonation JWT
    const accessToken = await this.authService.issueImpersonationToken(
      admin,
      targetUser,
      dto.targetTenantId,
      savedSession.id,
    );

    // Store hash of the token
    const tokenHash = createHash('sha256').update(accessToken).digest('hex');
    savedSession.tokenHash = tokenHash;
    await this.sessionsRepository.save(savedSession);

    // Publish audit event
    if (this.client) {
      this.client
        .emit('chassis.audit', {
          userId: admin.id,
          action: 'impersonate',
          meta: {
            targetUserId: targetUser.id,
            targetTenantId: dto.targetTenantId,
            reason: dto.reason,
            sessionId: savedSession.id,
          },
          timestamp: new Date().toISOString(),
        })
        .subscribe({
          error: (err: Error) =>
            this.logger.warn(`Failed to publish impersonation audit: ${err.message}`),
        });
    }

    this.logger.log(
      `Admin ${admin.id} started impersonating user ${targetUser.id} in tenant ${dto.targetTenantId}`,
    );

    return { accessToken, sessionId: savedSession.id };
  }

  async endImpersonation(
    currentUser: JwtPayload,
  ): Promise<AccessTokenResponseDto> {
    if (!currentUser.isImpersonating) {
      throw new ForbiddenException('Current session is not an impersonation session');
    }

    if (!currentUser.realUserId) {
      throw new UnauthorizedException('Missing realUserId in impersonation token');
    }

    // Find the active session by target user
    const session = await this.sessionsRepository.findOne({
      where: {
        targetUserId: currentUser.sub,
        adminUserId: currentUser.realUserId,
        endedAt: IsNull(),
      },
      order: { createdAt: 'DESC' },
    });

    if (session) {
      session.endedAt = new Date();
      await this.sessionsRepository.save(session);

      // Revoke the impersonation token
      await this.authService.revokeImpersonationToken(
        session.tokenHash,
        session.expiresAt,
      );
    }

    this.logger.log(
      `Ended impersonation session for admin ${currentUser.realUserId}`,
    );

    // Return the admin's regular token
    return this.authService.reissueAdminToken(currentUser.realUserId);
  }

  async findActiveSessions(adminUserId?: string): Promise<ImpersonationSession[]> {
    const qb = this.sessionsRepository
      .createQueryBuilder('s')
      .where('s.ended_at IS NULL')
      .andWhere('s.expires_at > :now', { now: new Date() });

    if (adminUserId) {
      qb.andWhere('s.admin_user_id = :adminUserId', { adminUserId });
    }

    return qb.getMany();
  }
}
