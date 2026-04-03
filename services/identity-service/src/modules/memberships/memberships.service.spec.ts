import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MembershipsService } from './memberships.service';
import { Membership, MembershipStatus } from './entities/membership.entity';
import { RolesService } from '../roles/roles.service';
import { RabbitMqPublisherService } from '../../common/messaging/rabbitmq-publisher.service';
import { Role } from '../roles/entities/role.entity';
import { User } from '../users/entities/user.entity';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRole(overrides: Partial<Role> = {}): Role {
  return {
    id: 'role-uuid-1',
    name: 'member',
    displayName: 'Member',
    tenantId: null,
    description: null,
    isSystemRole: false,
    permissions: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Role;
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
    user: {} as User,
    role: makeRole(),
    ...overrides,
  } as Membership;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('MembershipsService', () => {
  let service: MembershipsService;
  let membershipsRepo: jest.Mocked<Repository<Membership>>;
  let rolesService: jest.Mocked<RolesService>;
  let rabbitMqPublisher: jest.Mocked<RabbitMqPublisherService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MembershipsService,
        {
          provide: getRepositoryToken(Membership),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: RolesService,
          useValue: {
            findById: jest.fn(),
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

    service = module.get<MembershipsService>(MembershipsService);
    membershipsRepo = module.get(getRepositoryToken(Membership));
    rolesService = module.get(RolesService);
    rabbitMqPublisher = module.get(RabbitMqPublisherService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // create — new record
  // -------------------------------------------------------------------------

  describe('create', () => {
    it('creates and returns a new membership when none exists', async () => {
      const role = makeRole();
      const membership = makeMembership();
      membershipsRepo.findOne.mockResolvedValue(null);
      (rolesService.findById as jest.Mock).mockResolvedValue(role);
      membershipsRepo.create.mockReturnValue(membership);
      membershipsRepo.save.mockResolvedValue(membership);

      const result = await service.create({
        userId: 'user-uuid-1',
        tenantId: 'tenant-uuid-1',
        roleId: 'role-uuid-1',
      });

      expect(result).toEqual(membership);
      expect(membershipsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-uuid-1',
          tenantId: 'tenant-uuid-1',
          roleId: 'role-uuid-1',
          status: MembershipStatus.ACTIVE,
        }),
      );
    });

    it('publishes a tenant.user-added event after creation', async () => {
      const role = makeRole({ name: 'admin' });
      const membership = makeMembership();
      membershipsRepo.findOne.mockResolvedValue(null);
      (rolesService.findById as jest.Mock).mockResolvedValue(role);
      membershipsRepo.create.mockReturnValue(membership);
      membershipsRepo.save.mockResolvedValue(membership);

      await service.create({
        userId: 'user-uuid-1',
        tenantId: 'tenant-uuid-1',
        roleId: 'role-uuid-1',
      });

      expect(rabbitMqPublisher.publish).toHaveBeenCalledWith(
        'chassis.tenants',
        'tenant.user-added',
        expect.objectContaining({
          tenantId: 'tenant-uuid-1',
          userId: 'user-uuid-1',
          role: 'admin',
        }),
      );
    });

    it('throws ConflictException when an active membership already exists', async () => {
      const existing = makeMembership({ status: MembershipStatus.ACTIVE });
      membershipsRepo.findOne.mockResolvedValue(existing);
      (rolesService.findById as jest.Mock).mockResolvedValue(makeRole());

      await expect(
        service.create({
          userId: 'user-uuid-1',
          tenantId: 'tenant-uuid-1',
          roleId: 'role-uuid-1',
        }),
      ).rejects.toThrow(ConflictException);

      expect(membershipsRepo.save).not.toHaveBeenCalled();
    });

    it('throws ConflictException when an invited (non-removed) membership already exists', async () => {
      const existing = makeMembership({ status: MembershipStatus.INVITED });
      membershipsRepo.findOne.mockResolvedValue(existing);
      (rolesService.findById as jest.Mock).mockResolvedValue(makeRole());

      await expect(
        service.create({
          userId: 'user-uuid-1',
          tenantId: 'tenant-uuid-1',
          roleId: 'role-uuid-1',
        }),
      ).rejects.toThrow(ConflictException);
    });

    // ID-3 fix: soft-deleted records should be restored rather than duplicated
    it('restores a soft-deleted (REMOVED) membership instead of creating a duplicate', async () => {
      const role = makeRole({ name: 'editor' });
      const removedMembership = makeMembership({
        status: MembershipStatus.REMOVED,
        roleId: 'old-role-uuid',
      });
      const restoredMembership = {
        ...removedMembership,
        roleId: 'role-uuid-1',
        status: MembershipStatus.ACTIVE,
        joinedAt: expect.any(Date),
      };
      membershipsRepo.findOne.mockResolvedValue(removedMembership);
      (rolesService.findById as jest.Mock).mockResolvedValue(role);
      membershipsRepo.save.mockResolvedValue(restoredMembership as Membership);

      const result = await service.create({
        userId: 'user-uuid-1',
        tenantId: 'tenant-uuid-1',
        roleId: 'role-uuid-1',
      });

      // Should reuse the existing record (no call to create)
      expect(membershipsRepo.create).not.toHaveBeenCalled();
      // Should update the removed membership with the new role and ACTIVE status
      expect(membershipsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: removedMembership.id,
          roleId: 'role-uuid-1',
          status: MembershipStatus.ACTIVE,
        }),
      );
    });

    it('applies a custom status from the DTO when restoring a soft-deleted membership', async () => {
      const role = makeRole();
      const removed = makeMembership({ status: MembershipStatus.REMOVED });
      membershipsRepo.findOne.mockResolvedValue(removed);
      (rolesService.findById as jest.Mock).mockResolvedValue(role);
      membershipsRepo.save.mockResolvedValue({
        ...removed,
        status: MembershipStatus.INVITED,
      } as Membership);

      await service.create({
        userId: 'user-uuid-1',
        tenantId: 'tenant-uuid-1',
        roleId: 'role-uuid-1',
        status: MembershipStatus.INVITED,
      });

      expect(membershipsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: MembershipStatus.INVITED }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // findByUserAndTenant
  // -------------------------------------------------------------------------

  describe('findByUserAndTenant', () => {
    it('returns the membership when found', async () => {
      const membership = makeMembership();
      membershipsRepo.findOne.mockResolvedValue(membership);

      const result = await service.findByUserAndTenant('user-uuid-1', 'tenant-uuid-1');

      expect(result).toEqual(membership);
      expect(membershipsRepo.findOne).toHaveBeenCalledWith({
        where: { userId: 'user-uuid-1', tenantId: 'tenant-uuid-1' },
        relations: ['role', 'role.permissions'],
      });
    });

    it('returns null when no membership exists for the user/tenant pair', async () => {
      membershipsRepo.findOne.mockResolvedValue(null);

      const result = await service.findByUserAndTenant('user-uuid-1', 'other-tenant');

      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // findByUserId
  // -------------------------------------------------------------------------

  describe('findByUserId', () => {
    it('returns all memberships for a user', async () => {
      const memberships = [makeMembership(), makeMembership({ id: 'mem-uuid-2', tenantId: 'tenant-uuid-2' })];
      membershipsRepo.find.mockResolvedValue(memberships);

      const result = await service.findByUserId('user-uuid-1');

      expect(result).toEqual(memberships);
      expect(membershipsRepo.find).toHaveBeenCalledWith({
        where: { userId: 'user-uuid-1' },
        relations: ['role', 'role.permissions'],
      });
    });

    it('returns an empty array when the user has no memberships', async () => {
      membershipsRepo.find.mockResolvedValue([]);

      const result = await service.findByUserId('user-uuid-1');

      expect(result).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // remove
  // -------------------------------------------------------------------------

  describe('remove', () => {
    it('sets membership status to REMOVED (soft delete)', async () => {
      const membership = makeMembership({ status: MembershipStatus.ACTIVE });
      membershipsRepo.findOne.mockResolvedValue(membership);
      membershipsRepo.save.mockResolvedValue({ ...membership, status: MembershipStatus.REMOVED } as Membership);

      await service.remove('user-uuid-1', 'tenant-uuid-1');

      expect(membershipsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: MembershipStatus.REMOVED }),
      );
    });

    it('throws NotFoundException when membership does not exist', async () => {
      membershipsRepo.findOne.mockResolvedValue(null);

      await expect(
        service.remove('user-uuid-1', 'nonexistent-tenant'),
      ).rejects.toThrow(NotFoundException);

      expect(membershipsRepo.save).not.toHaveBeenCalled();
    });
  });
});
