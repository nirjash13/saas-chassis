import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { MembershipsService } from '../memberships/memberships.service';
import { RefreshToken } from './entities/refresh-token.entity';
import { User } from '../users/entities/user.entity';
import { Membership, MembershipStatus } from '../memberships/entities/membership.entity';
import { RabbitMqPublisherService } from '../../common/messaging/rabbitmq-publisher.service';

// ---------------------------------------------------------------------------
// Redis mock — hoisted so the constructor call inside AuthService is captured
// ---------------------------------------------------------------------------

const redisMock = {
  get: jest.fn(),
  set: jest.fn(),
  setex: jest.fn(),
  del: jest.fn(),
  incr: jest.fn(),
  expire: jest.fn(),
  quit: jest.fn().mockResolvedValue('OK'),
};

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => redisMock);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-uuid-1',
    email: 'alice@example.com',
    emailVerified: true,
    passwordHash: '$2a$12$hashedpassword',
    displayName: 'Alice',
    avatarUrl: null,
    phone: null,
    isPlatformAdmin: false,
    isActive: true,
    lastLoginAt: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    memberships: [],
    ...overrides,
  } as User;
}

function makeRefreshToken(overrides: Partial<RefreshToken> = {}): RefreshToken {
  const future = new Date(Date.now() + 7 * 24 * 3600 * 1000);
  const rt = Object.assign(new RefreshToken(), {
    id: 'rt-uuid-1',
    userId: 'user-uuid-1',
    tokenHash: 'some-hash',
    deviceInfo: null,
    ipAddress: null,
    expiresAt: future,
    revokedAt: null,
    createdAt: new Date(),
    user: makeUser(),
    ...overrides,
  });
  return rt;
}

function makeMembership(overrides: Partial<Membership> = {}): Membership {
  return {
    id: 'mem-uuid-1',
    userId: 'user-uuid-1',
    tenantId: 'tenant-uuid-1',
    roleId: 'role-uuid-1',
    status: MembershipStatus.ACTIVE,
    invitedBy: null,
    invitedAt: null,
    joinedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    user: makeUser(),
    role: { id: 'role-uuid-1', name: 'member', displayName: 'Member', permissions: [], tenantId: null, description: null, isSystemRole: false, createdAt: new Date(), updatedAt: new Date() },
    ...overrides,
  } as Membership;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('AuthService', () => {
  let service: AuthService;
  let usersService: jest.Mocked<UsersService>;
  let membershipsService: jest.Mocked<MembershipsService>;
  let jwtService: jest.Mocked<JwtService>;
  let configService: jest.Mocked<ConfigService>;
  let refreshTokenRepo: jest.Mocked<Repository<RefreshToken>>;
  let rabbitMqPublisher: jest.Mocked<RabbitMqPublisherService>;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: {
            findByEmail: jest.fn(),
            findById: jest.fn(),
            updateLastLogin: jest.fn().mockResolvedValue(undefined),
            create: jest.fn(),
          },
        },
        {
          provide: MembershipsService,
          useValue: {
            findByUserId: jest.fn(),
            findByUserAndTenant: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn().mockReturnValue('signed-jwt-token'),
            verify: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string) => {
              const config: Record<string, unknown> = {
                'app.redis.url': 'redis://localhost:6379',
                'app.jwt.expiry': '15m',
                'app.jwt.refreshExpiry': '7d',
                'app.rateLimit.loginMaxAttempts': 5,
                'app.rateLimit.loginBlockDurationSeconds': 900,
              };
              return config[key] ?? undefined;
            }),
          },
        },
        {
          provide: getRepositoryToken(RefreshToken),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: RabbitMqPublisherService,
          useValue: {
            publish: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    usersService = module.get(UsersService);
    membershipsService = module.get(MembershipsService);
    jwtService = module.get(JwtService);
    configService = module.get(ConfigService);
    refreshTokenRepo = module.get(getRepositoryToken(RefreshToken));
    rabbitMqPublisher = module.get(RabbitMqPublisherService);
  });

  afterAll(async () => {
    // Prevent open handle from Redis mock
    await service.onModuleDestroy();
  });

  // -------------------------------------------------------------------------
  // validateCredentials
  // -------------------------------------------------------------------------

  describe('validateCredentials', () => {
    it('returns null and increments counter when user is not found', async () => {
      redisMock.get.mockResolvedValue(null);
      redisMock.incr.mockResolvedValue(1);
      redisMock.expire.mockResolvedValue(1);
      (usersService.findByEmail as jest.Mock).mockResolvedValue(null);

      const result = await service.validateCredentials('nobody@example.com', 'pass');

      expect(result).toBeNull();
      expect(redisMock.incr).toHaveBeenCalled();
    });

    it('returns null and increments counter when password is wrong', async () => {
      redisMock.get.mockResolvedValue(null);
      redisMock.incr.mockResolvedValue(1);
      redisMock.expire.mockResolvedValue(1);

      // bcryptjs compareSync will return false for a plaintext password against
      // a real hash that does not match, so we use a known-invalid hash.
      const user = makeUser({ passwordHash: '$2a$12$invalidhashvalue000000000000000000000000000000000000000' });
      (usersService.findByEmail as jest.Mock).mockResolvedValue(user);

      const result = await service.validateCredentials('alice@example.com', 'wrongpassword');

      expect(result).toBeNull();
      expect(redisMock.incr).toHaveBeenCalled();
    });

    it('throws UnauthorizedException when account is locked (max attempts reached)', async () => {
      redisMock.get.mockResolvedValue('5'); // already at max

      await expect(
        service.validateCredentials('alice@example.com', 'any'),
      ).rejects.toThrow(UnauthorizedException);

      expect(usersService.findByEmail).not.toHaveBeenCalled();
    });

    it('returns null for inactive user', async () => {
      redisMock.get.mockResolvedValue(null);
      redisMock.incr.mockResolvedValue(1);
      redisMock.expire.mockResolvedValue(1);

      const inactiveUser = makeUser({ isActive: false });
      (usersService.findByEmail as jest.Mock).mockResolvedValue(inactiveUser);

      const result = await service.validateCredentials('alice@example.com', 'Password1');

      expect(result).toBeNull();
    });

    it('clears failed-attempt counter on successful validation', async () => {
      redisMock.get.mockResolvedValue(null);
      redisMock.del.mockResolvedValue(1);

      // Use a real bcrypt hash of 'Password1' so compareSync passes
      const { hashSync } = await import('bcryptjs');
      const hash = hashSync('Password1', 4); // low rounds for speed in tests
      const user = makeUser({ passwordHash: hash });
      (usersService.findByEmail as jest.Mock).mockResolvedValue(user);

      const result = await service.validateCredentials('alice@example.com', 'Password1');

      expect(result).toEqual(user);
      expect(redisMock.del).toHaveBeenCalledWith(
        'login_attempts:alice@example.com',
      );
    });
  });

  // -------------------------------------------------------------------------
  // login
  // -------------------------------------------------------------------------

  describe('login', () => {
    it('returns token response with accessToken, refreshToken, expiresIn, and tokenType', async () => {
      const user = makeUser();
      const membership = makeMembership();
      (membershipsService.findByUserId as jest.Mock).mockResolvedValue([membership]);
      (jwtService.sign as jest.Mock).mockReturnValue('access-token-value');
      refreshTokenRepo.create.mockReturnValue(makeRefreshToken());
      refreshTokenRepo.save.mockResolvedValue(makeRefreshToken());

      const response = await service.login(user, '127.0.0.1', 'Chrome');

      expect(response).toMatchObject({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
        expiresIn: expect.any(Number),
        tokenType: 'Bearer',
      });
      expect(usersService.updateLastLogin).toHaveBeenCalledWith(user.id);
    });

    it('publishes a user.login audit event', async () => {
      const user = makeUser();
      (membershipsService.findByUserId as jest.Mock).mockResolvedValue([]);
      refreshTokenRepo.create.mockReturnValue(makeRefreshToken());
      refreshTokenRepo.save.mockResolvedValue(makeRefreshToken());

      await service.login(user, '10.0.0.1');

      expect(rabbitMqPublisher.publish).toHaveBeenCalledWith(
        'chassis.audit',
        'user.login',
        expect.objectContaining({ userId: user.id, action: 'login' }),
      );
    });

    it('uses the first active membership as the tenant context', async () => {
      const user = makeUser();
      const invitedMembership = makeMembership({ status: MembershipStatus.INVITED });
      const activeMembership = makeMembership({ tenantId: 'active-tenant-id', status: MembershipStatus.ACTIVE });
      (membershipsService.findByUserId as jest.Mock).mockResolvedValue([
        invitedMembership,
        activeMembership,
      ]);
      refreshTokenRepo.create.mockReturnValue(makeRefreshToken());
      refreshTokenRepo.save.mockResolvedValue(makeRefreshToken());

      await service.login(user);

      // The JWT sign payload should contain the active tenant id
      const signCallPayload = (jwtService.sign as jest.Mock).mock.calls[0][0];
      expect(signCallPayload.tenantId).toBe('active-tenant-id');
    });

    it('issues token with null tenantId when user has no active memberships', async () => {
      const user = makeUser();
      (membershipsService.findByUserId as jest.Mock).mockResolvedValue([]);
      refreshTokenRepo.create.mockReturnValue(makeRefreshToken());
      refreshTokenRepo.save.mockResolvedValue(makeRefreshToken());

      await service.login(user);

      const signCallPayload = (jwtService.sign as jest.Mock).mock.calls[0][0];
      expect(signCallPayload.tenantId).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // register
  // -------------------------------------------------------------------------

  describe('register', () => {
    it('creates user then logs them in, returning tokens', async () => {
      const newUser = makeUser();
      (usersService.create as jest.Mock).mockResolvedValue(newUser);
      (membershipsService.findByUserId as jest.Mock).mockResolvedValue([]);
      refreshTokenRepo.create.mockReturnValue(makeRefreshToken());
      refreshTokenRepo.save.mockResolvedValue(makeRefreshToken());

      const dto = {
        email: 'alice@example.com',
        password: 'Password1!',
        displayName: 'Alice',
      };

      const response = await service.register(dto);

      expect(usersService.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: dto.email }),
      );
      expect(response).toMatchObject({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
        tokenType: 'Bearer',
      });
    });
  });

  // -------------------------------------------------------------------------
  // logout
  // -------------------------------------------------------------------------

  describe('logout', () => {
    it('revokes the stored refresh token and adds it to the Redis blacklist', async () => {
      const future = new Date(Date.now() + 3600 * 1000);
      const storedToken = makeRefreshToken({ expiresAt: future, revokedAt: null });
      refreshTokenRepo.findOne.mockResolvedValue(storedToken);
      refreshTokenRepo.save.mockResolvedValue(makeRefreshToken({ expiresAt: future, revokedAt: new Date() }));
      redisMock.setex.mockResolvedValue('OK');

      await service.logout('some-raw-token-value');

      expect(refreshTokenRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ revokedAt: expect.any(Date) }),
      );
      expect(redisMock.setex).toHaveBeenCalledWith(
        expect.stringContaining('revoked:'),
        expect.any(Number),
        '1',
      );
    });

    it('does nothing when the refresh token is not found in DB', async () => {
      refreshTokenRepo.findOne.mockResolvedValue(null);

      await service.logout('unknown-token');

      expect(refreshTokenRepo.save).not.toHaveBeenCalled();
      expect(redisMock.setex).not.toHaveBeenCalled();
    });

    it('does nothing when token is already revoked', async () => {
      const alreadyRevoked = makeRefreshToken({ revokedAt: new Date() });
      refreshTokenRepo.findOne.mockResolvedValue(alreadyRevoked);

      await service.logout('already-revoked-token');

      expect(refreshTokenRepo.save).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // refreshAccessToken
  // -------------------------------------------------------------------------

  describe('refreshAccessToken', () => {
    it('returns new access token for a valid refresh token', async () => {
      redisMock.get.mockResolvedValue(null); // not blacklisted
      const storedToken = makeRefreshToken();
      refreshTokenRepo.findOne.mockResolvedValue(storedToken);
      (membershipsService.findByUserId as jest.Mock).mockResolvedValue([]);
      (jwtService.sign as jest.Mock).mockReturnValue('new-access-token');

      const response = await service.refreshAccessToken('valid-raw-refresh-token');

      expect(response).toMatchObject({
        accessToken: 'new-access-token',
        expiresIn: expect.any(Number),
        tokenType: 'Bearer',
      });
    });

    it('throws UnauthorizedException when token is blacklisted in Redis', async () => {
      redisMock.get.mockResolvedValue('1'); // blacklisted

      await expect(
        service.refreshAccessToken('revoked-token'),
      ).rejects.toThrow(UnauthorizedException);

      expect(refreshTokenRepo.findOne).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException when token is not found in DB', async () => {
      redisMock.get.mockResolvedValue(null);
      refreshTokenRepo.findOne.mockResolvedValue(null);

      await expect(
        service.refreshAccessToken('missing-token'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when stored token has been revoked (isValid = false)', async () => {
      redisMock.get.mockResolvedValue(null);
      const revokedToken = makeRefreshToken({ revokedAt: new Date() });
      refreshTokenRepo.findOne.mockResolvedValue(revokedToken);

      await expect(
        service.refreshAccessToken('revoked-token'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when stored token is expired', async () => {
      redisMock.get.mockResolvedValue(null);
      const past = new Date(Date.now() - 1000);
      const expiredToken = makeRefreshToken({ expiresAt: past, revokedAt: null });
      refreshTokenRepo.findOne.mockResolvedValue(expiredToken);

      await expect(
        service.refreshAccessToken('expired-token'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when the user is inactive', async () => {
      redisMock.get.mockResolvedValue(null);
      const inactiveUser = makeUser({ isActive: false });
      const storedToken = makeRefreshToken({ user: inactiveUser });
      refreshTokenRepo.findOne.mockResolvedValue(storedToken);

      await expect(
        service.refreshAccessToken('valid-raw-token'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // -------------------------------------------------------------------------
  // switchTenant
  // -------------------------------------------------------------------------

  describe('switchTenant', () => {
    it('returns new access token when user has membership in target tenant', async () => {
      const user = makeUser();
      const membership = makeMembership({ tenantId: 'tenant-uuid-1' });
      (usersService.findById as jest.Mock).mockResolvedValue(user);
      (membershipsService.findByUserAndTenant as jest.Mock).mockResolvedValue(membership);
      (jwtService.sign as jest.Mock).mockReturnValue('tenant-access-token');

      const response = await service.switchTenant('user-uuid-1', 'tenant-uuid-1');

      expect(response).toMatchObject({
        accessToken: 'tenant-access-token',
        tokenType: 'Bearer',
      });
    });

    it('throws ForbiddenException when user has no membership and is not platform admin', async () => {
      const user = makeUser({ isPlatformAdmin: false });
      (usersService.findById as jest.Mock).mockResolvedValue(user);
      (membershipsService.findByUserAndTenant as jest.Mock).mockResolvedValue(null);

      await expect(
        service.switchTenant('user-uuid-1', 'other-tenant-id'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows platform admin to switch to any tenant without membership', async () => {
      const admin = makeUser({ isPlatformAdmin: true });
      (usersService.findById as jest.Mock).mockResolvedValue(admin);
      (membershipsService.findByUserAndTenant as jest.Mock).mockResolvedValue(null);
      (jwtService.sign as jest.Mock).mockReturnValue('admin-tenant-token');

      const response = await service.switchTenant('user-uuid-1', 'any-tenant-id');

      expect(response.accessToken).toBe('admin-tenant-token');
    });
  });

  // -------------------------------------------------------------------------
  // getMe
  // -------------------------------------------------------------------------

  describe('getMe', () => {
    it('delegates to usersService.findById', async () => {
      const user = makeUser();
      (usersService.findById as jest.Mock).mockResolvedValue(user);

      const result = await service.getMe('user-uuid-1');

      expect(result).toEqual(user);
      expect(usersService.findById).toHaveBeenCalledWith('user-uuid-1');
    });
  });
});
