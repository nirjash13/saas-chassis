import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { Membership, MembershipStatus } from '../memberships/entities/membership.entity';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-uuid-1',
    email: 'alice@example.com',
    emailVerified: false,
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

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('UsersService', () => {
  let service: UsersService;
  let usersRepo: jest.Mocked<Repository<User>>;
  let membershipsRepo: jest.Mocked<Repository<Membership>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Membership),
          useValue: {
            find: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    usersRepo = module.get(getRepositoryToken(User));
    membershipsRepo = module.get(getRepositoryToken(Membership));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // create
  // -------------------------------------------------------------------------

  describe('create', () => {
    it('creates and returns a new user with a hashed password', async () => {
      usersRepo.findOne.mockResolvedValue(null); // no existing user
      const created = makeUser();
      usersRepo.create.mockReturnValue(created);
      usersRepo.save.mockResolvedValue(created);

      const result = await service.create({
        email: 'alice@example.com',
        password: 'Password1',
        displayName: 'Alice',
      });

      expect(result).toEqual(created);
      // The password field in the created entity should NOT be the plaintext value
      const createCallArg = usersRepo.create.mock.calls[0][0] as Partial<User>;
      expect(createCallArg.passwordHash).toBeDefined();
      expect(createCallArg.passwordHash).not.toBe('Password1');
    });

    it('stores email in lowercase', async () => {
      usersRepo.findOne.mockResolvedValue(null);
      const created = makeUser({ email: 'alice@example.com' });
      usersRepo.create.mockReturnValue(created);
      usersRepo.save.mockResolvedValue(created);

      await service.create({
        email: 'ALICE@EXAMPLE.COM',
        password: 'Password1',
        displayName: 'Alice',
      });

      const createCallArg = usersRepo.create.mock.calls[0][0] as Partial<User>;
      expect(createCallArg.email).toBe('alice@example.com');
    });

    it('throws ConflictException when a user with the same email already exists', async () => {
      const existingUser = makeUser();
      usersRepo.findOne.mockResolvedValue(existingUser);

      await expect(
        service.create({
          email: 'alice@example.com',
          password: 'Password1',
          displayName: 'Alice',
        }),
      ).rejects.toThrow(ConflictException);

      expect(usersRepo.save).not.toHaveBeenCalled();
    });

    it('sets isActive to true and isPlatformAdmin to false by default', async () => {
      usersRepo.findOne.mockResolvedValue(null);
      const created = makeUser();
      usersRepo.create.mockReturnValue(created);
      usersRepo.save.mockResolvedValue(created);

      await service.create({
        email: 'alice@example.com',
        password: 'Password1',
        displayName: 'Alice',
      });

      const createCallArg = usersRepo.create.mock.calls[0][0] as Partial<User>;
      expect(createCallArg.isActive).toBe(true);
      expect(createCallArg.isPlatformAdmin).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // findByEmail
  // -------------------------------------------------------------------------

  describe('findByEmail', () => {
    it('returns the user when found', async () => {
      const user = makeUser();
      usersRepo.findOne.mockResolvedValue(user);

      const result = await service.findByEmail('alice@example.com');

      expect(result).toEqual(user);
      expect(usersRepo.findOne).toHaveBeenCalledWith({
        where: { email: 'alice@example.com' },
      });
    });

    it('returns null when no user matches the email', async () => {
      usersRepo.findOne.mockResolvedValue(null);

      const result = await service.findByEmail('nobody@example.com');

      expect(result).toBeNull();
    });

    it('normalizes the email to lowercase before querying', async () => {
      usersRepo.findOne.mockResolvedValue(null);

      await service.findByEmail('ALICE@EXAMPLE.COM');

      expect(usersRepo.findOne).toHaveBeenCalledWith({
        where: { email: 'alice@example.com' },
      });
    });
  });

  // -------------------------------------------------------------------------
  // findById
  // -------------------------------------------------------------------------

  describe('findById', () => {
    it('returns the user when found', async () => {
      const user = makeUser();
      usersRepo.findOne.mockResolvedValue(user);

      const result = await service.findById('user-uuid-1');

      expect(result).toEqual(user);
      expect(usersRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'user-uuid-1' },
        relations: ['memberships', 'memberships.role'],
      });
    });

    it('throws NotFoundException when no user exists with that ID', async () => {
      usersRepo.findOne.mockResolvedValue(null);

      await expect(service.findById('nonexistent-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // -------------------------------------------------------------------------
  // findAll
  // -------------------------------------------------------------------------

  describe('findAll', () => {
    it('returns all users when the requesting user is a platform admin', async () => {
      const users = [makeUser(), makeUser({ id: 'user-uuid-2', email: 'bob@example.com' })];
      usersRepo.find.mockResolvedValue(users);

      const result = await service.findAll({ isPlatformAdmin: true });

      expect(result).toEqual(users);
      expect(usersRepo.find).toHaveBeenCalledWith({ order: { createdAt: 'DESC' } });
    });

    it('returns empty array when tenant user has no tenantId', async () => {
      const result = await service.findAll({ isPlatformAdmin: false, tenantId: null });

      expect(result).toEqual([]);
      expect(usersRepo.find).not.toHaveBeenCalled();
    });

    it('returns only tenant members when requesting user is a tenant admin', async () => {
      const user = makeUser();
      const membership = {
        id: 'mem-1',
        tenantId: 'tenant-uuid-1',
        user,
      } as Membership;
      membershipsRepo.find.mockResolvedValue([membership]);

      const result = await service.findAll({ isPlatformAdmin: false, tenantId: 'tenant-uuid-1' });

      expect(result).toEqual([user]);
      expect(membershipsRepo.find).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-uuid-1' },
        relations: ['user'],
      });
    });
  });

  // -------------------------------------------------------------------------
  // updateLastLogin
  // -------------------------------------------------------------------------

  describe('updateLastLogin', () => {
    it('updates the lastLoginAt timestamp for the user', async () => {
      usersRepo.update.mockResolvedValue({ affected: 1, raw: [], generatedMaps: [] });

      await service.updateLastLogin('user-uuid-1');

      expect(usersRepo.update).toHaveBeenCalledWith(
        'user-uuid-1',
        expect.objectContaining({ lastLoginAt: expect.any(Date) }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // softDelete
  // -------------------------------------------------------------------------

  describe('softDelete', () => {
    it('sets isActive to false without deleting the record', async () => {
      const user = makeUser({ isActive: true });
      usersRepo.findOne.mockResolvedValue(user);
      usersRepo.save.mockResolvedValue({ ...user, isActive: false });

      await service.softDelete('user-uuid-1');

      expect(usersRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: false }),
      );
    });

    it('throws NotFoundException when user does not exist', async () => {
      usersRepo.findOne.mockResolvedValue(null);

      await expect(service.softDelete('nonexistent-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
