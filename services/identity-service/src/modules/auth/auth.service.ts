import {
  ForbiddenException,
  Injectable,
  Logger,
  OnModuleDestroy,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { compareSync } from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import Redis from 'ioredis';
import { User } from '../users/entities/user.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import {
  Membership,
  MembershipStatus,
} from '../memberships/entities/membership.entity';
import { UsersService } from '../users/users.service';
import { MembershipsService } from '../memberships/memberships.service';
import { RegisterDto } from './dto/register.dto';
import {
  TokenResponseDto,
  AccessTokenResponseDto,
} from './dto/token-response.dto';
import { JwtPayload } from './strategies/jwt.strategy';
import { RabbitMqPublisherService } from '../../common/messaging/rabbitmq-publisher.service';

@Injectable()
export class AuthService implements OnModuleDestroy {
  private readonly logger = new Logger(AuthService.name);
  private readonly redis: Redis;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly membershipsService: MembershipsService,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    private readonly rabbitMqPublisher: RabbitMqPublisherService,
  ) {
    const redisUrl =
      this.configService.get<string>('app.redis.url') ??
      'redis://localhost:6379';
    this.redis = new Redis(redisUrl);
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }

  // ---- Credential validation (used by LocalStrategy) ----

  async validateCredentials(
    email: string,
    password: string,
  ): Promise<User | null> {
    const loginAttemptsKey = `login_attempts:${email.toLowerCase()}`;

    // Check if blocked
    const attempts = await this.redis.get(loginAttemptsKey);
    const maxAttempts =
      this.configService.get<number>('app.rateLimit.loginMaxAttempts') ?? 5;

    if (attempts && parseInt(attempts, 10) >= maxAttempts) {
      throw new UnauthorizedException(
        'Account temporarily locked due to too many failed login attempts. Try again in 15 minutes.',
      );
    }

    const user = await this.usersService.findByEmail(email);

    if (!user || !user.isActive) {
      await this.incrementLoginAttempts(loginAttemptsKey);
      return null;
    }

    const isPasswordValid = compareSync(password, user.passwordHash);
    if (!isPasswordValid) {
      await this.incrementLoginAttempts(loginAttemptsKey);
      return null;
    }

    // Clear failed attempts on success
    await this.redis.del(loginAttemptsKey);
    return user;
  }

  private async incrementLoginAttempts(key: string): Promise<void> {
    const blockDuration =
      this.configService.get<number>(
        'app.rateLimit.loginBlockDurationSeconds',
      ) ?? 900;
    const current = await this.redis.incr(key);
    if (current === 1) {
      await this.redis.expire(key, blockDuration);
    }
  }

  // ---- Login ----

  async login(
    user: User,
    ipAddress?: string,
    deviceInfo?: string,
  ): Promise<TokenResponseDto> {
    const memberships = await this.membershipsService.findByUserId(user.id);

    // Default to first active membership tenant context
    const primaryMembership =
      memberships.find((m) => m.status === MembershipStatus.ACTIVE) ?? null;

    const payload = await this.buildJwtPayload(user, primaryMembership);
    const { accessToken, refreshToken, expiresIn } = await this.issueTokens(
      payload,
      user.id,
      ipAddress,
      deviceInfo,
    );

    await this.usersService.updateLastLogin(user.id);

    // Publish audit event
    this.rabbitMqPublisher.publish('chassis.audit', 'user.login', {
      userId: user.id,
      action: 'login',
      meta: { email: user.email, ipAddress },
      timestamp: new Date().toISOString(),
    });

    return { accessToken, refreshToken, expiresIn, tokenType: 'Bearer' };
  }

  // ---- Register ----

  async register(dto: RegisterDto): Promise<TokenResponseDto> {
    const user = await this.usersService.create({
      email: dto.email,
      password: dto.password,
      displayName: dto.displayName,
      phone: dto.phone,
    });

    return this.login(user);
  }

  // ---- Refresh ----

  async refreshAccessToken(
    refreshTokenValue: string,
  ): Promise<AccessTokenResponseDto> {
    const tokenHash = this.hashToken(refreshTokenValue);

    // Check Redis blacklist
    const blacklisted = await this.redis.get(`revoked:${tokenHash}`);
    if (blacklisted) {
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    const stored = await this.refreshTokenRepository.findOne({
      where: { tokenHash },
      relations: ['user'],
    });

    if (!stored || !stored.isValid) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = stored.user;
    if (!user.isActive) {
      throw new UnauthorizedException('User account is inactive');
    }

    const memberships = await this.membershipsService.findByUserId(user.id);
    const primaryMembership =
      memberships.find((m) => m.status === MembershipStatus.ACTIVE) ?? null;

    const payload = await this.buildJwtPayload(user, primaryMembership);
    const accessToken = this.signAccessToken(payload);
    const expiresIn = this.getExpiresInSeconds();

    return { accessToken, expiresIn, tokenType: 'Bearer' };
  }

  // ---- Logout ----

  async logout(refreshTokenValue: string): Promise<void> {
    const tokenHash = this.hashToken(refreshTokenValue);

    const stored = await this.refreshTokenRepository.findOne({
      where: { tokenHash },
    });

    if (stored && !stored.isRevoked) {
      stored.revokedAt = new Date();
      await this.refreshTokenRepository.save(stored);

      // Add to Redis blacklist with remaining TTL
      const ttl = Math.max(
        0,
        Math.floor((stored.expiresAt.getTime() - Date.now()) / 1000),
      );
      if (ttl > 0) {
        await this.redis.setex(`revoked:${tokenHash}`, ttl, '1');
      }
    }
  }

  // ---- Switch Tenant ----

  async switchTenant(
    userId: string,
    tenantId: string,
  ): Promise<AccessTokenResponseDto> {
    const user = await this.usersService.findById(userId);
    const membership = await this.membershipsService.findByUserAndTenant(
      userId,
      tenantId,
    );

    if (!membership && !user.isPlatformAdmin) {
      throw new ForbiddenException(
        `User does not have access to tenant ${tenantId}`,
      );
    }

    const payload = await this.buildJwtPayload(user, membership ?? null);
    const accessToken = this.signAccessToken(payload);
    const expiresIn = this.getExpiresInSeconds();

    return { accessToken, expiresIn, tokenType: 'Bearer' };
  }

  // ---- Me ----

  async getMe(userId: string): Promise<User> {
    return this.usersService.findById(userId);
  }

  // ---- Impersonation token issuance ----

  async issueImpersonationToken(
    adminUser: User,
    targetUser: User,
    targetTenantId: string,
  ): Promise<string> {
    const membership = await this.membershipsService.findByUserAndTenant(
      targetUser.id,
      targetTenantId,
    );

    const memberships = await this.membershipsService.findByUserId(
      targetUser.id,
    );
    const tenantMembership =
      membership ??
      memberships.find((m) => m.tenantId === targetTenantId) ??
      null;

    const roles: string[] = tenantMembership?.role
      ? [tenantMembership.role.name]
      : [];

    const permissions: string[] = tenantMembership?.role?.permissions
      ? tenantMembership.role.permissions.map(
          (p) => `${p.resource}:${p.action}`,
        )
      : [];

    const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
      sub: targetUser.id,
      email: targetUser.email,
      displayName: targetUser.displayName,
      isPlatformAdmin: false, // Impersonation tokens never grant platform admin
      tenantId: targetTenantId,
      tenantSlug: null,
      roles,
      permissions,
      isImpersonating: true,
      realUserId: adminUser.id,
    };

    const impersonationExpiry =
      this.configService.get<string>('app.jwt.impersonationExpiry') ?? '30m';

    return this.jwtService.sign(payload, { expiresIn: impersonationExpiry });
  }

  async revokeImpersonationToken(
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    const ttl = Math.max(
      0,
      Math.floor((expiresAt.getTime() - Date.now()) / 1000),
    );
    if (ttl > 0) {
      await this.redis.setex(`revoked:${tokenHash}`, ttl, '1');
    }
  }

  async reissueAdminToken(
    adminUserId: string,
  ): Promise<AccessTokenResponseDto> {
    const user = await this.usersService.findById(adminUserId);
    const memberships = await this.membershipsService.findByUserId(user.id);
    const primaryMembership =
      memberships.find((m) => m.status === MembershipStatus.ACTIVE) ?? null;

    const payload = await this.buildJwtPayload(user, primaryMembership);
    const accessToken = this.signAccessToken(payload);
    const expiresIn = this.getExpiresInSeconds();

    return { accessToken, expiresIn, tokenType: 'Bearer' };
  }

  // ---- Helpers ----

  private async buildJwtPayload(
    user: User,
    membership: Membership | null,
  ): Promise<Omit<JwtPayload, 'iat' | 'exp'>> {
    let roles: string[] = [];
    let permissions: string[] = [];

    if (membership?.role) {
      roles = [membership.role.name];
      permissions =
        membership.role.permissions?.map((p) => `${p.resource}:${p.action}`) ??
        [];
    }

    return {
      sub: user.id,
      email: user.email,
      displayName: user.displayName,
      isPlatformAdmin: user.isPlatformAdmin,
      tenantId: membership?.tenantId ?? null,
      tenantSlug: null, // Tenant slug would come from tenant-manager service
      roles,
      permissions,
      isImpersonating: false,
    };
  }

  private async issueTokens(
    payload: Omit<JwtPayload, 'iat' | 'exp'>,
    userId: string,
    ipAddress?: string,
    deviceInfo?: string,
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    const accessToken = this.signAccessToken(payload);
    const refreshToken = randomBytes(64).toString('hex');
    const tokenHash = this.hashToken(refreshToken);

    const refreshExpiry =
      this.configService.get<string>('app.jwt.refreshExpiry') ?? '7d';
    const expiresAt = this.parseExpiry(refreshExpiry);

    const rt = this.refreshTokenRepository.create({
      userId,
      tokenHash,
      ipAddress: ipAddress ?? null,
      deviceInfo: deviceInfo ?? null,
      expiresAt,
    });
    await this.refreshTokenRepository.save(rt);

    return { accessToken, refreshToken, expiresIn: this.getExpiresInSeconds() };
  }

  private signAccessToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
    const expiry = this.configService.get<string>('app.jwt.expiry') ?? '15m';
    return this.jwtService.sign(payload, { expiresIn: expiry });
  }

  private getExpiresInSeconds(): number {
    const expiry = this.configService.get<string>('app.jwt.expiry') ?? '15m';
    return this.parseDurationToSeconds(expiry);
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private parseExpiry(expiry: string): Date {
    const seconds = this.parseDurationToSeconds(expiry);
    return new Date(Date.now() + seconds * 1000);
  }

  private parseDurationToSeconds(duration: string): number {
    const match = /^(\d+)([smhd])$/.exec(duration);
    if (!match) return 900; // default 15 min

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 's':
        return value;
      case 'm':
        return value * 60;
      case 'h':
        return value * 3600;
      case 'd':
        return value * 86400;
      default:
        return 900;
    }
  }
}
