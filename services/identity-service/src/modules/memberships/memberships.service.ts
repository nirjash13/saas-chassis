import {
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Membership, MembershipStatus } from './entities/membership.entity';
import { CreateMembershipDto } from './dto/create-membership.dto';
import { RolesService } from '../roles/roles.service';
import { RabbitMqPublisherService } from '../../common/messaging/rabbitmq-publisher.service';

@Injectable()
export class MembershipsService {
  private readonly logger = new Logger(MembershipsService.name);

  constructor(
    @InjectRepository(Membership)
    private readonly membershipsRepository: Repository<Membership>,
    @Inject(forwardRef(() => RolesService))
    private readonly rolesService: RolesService,
    private readonly rabbitMqPublisher: RabbitMqPublisherService,
  ) {}

  async findByUserId(userId: string): Promise<Membership[]> {
    return this.membershipsRepository.find({
      where: { userId },
      relations: ['role', 'role.permissions'],
    });
  }

  async findByTenantId(tenantId: string): Promise<Membership[]> {
    return this.membershipsRepository.find({
      where: { tenantId, status: MembershipStatus.ACTIVE },
      relations: ['user', 'role'],
    });
  }

  async findByUserAndTenant(
    userId: string,
    tenantId: string,
  ): Promise<Membership | null> {
    return this.membershipsRepository.findOne({
      where: { userId, tenantId },
      relations: ['role', 'role.permissions'],
    });
  }

  async create(dto: CreateMembershipDto): Promise<Membership> {
    // Check for any existing record, including soft-deleted (status=REMOVED) ones
    const existing = await this.membershipsRepository.findOne({
      where: { userId: dto.userId, tenantId: dto.tenantId },
    });

    // Validate the role exists
    const role = await this.rolesService.findById(dto.roleId);

    let saved: Membership;

    if (existing) {
      if (existing.status !== MembershipStatus.REMOVED) {
        throw new ConflictException(
          `User ${dto.userId} already has an active membership in tenant ${dto.tenantId}`,
        );
      }
      // Restore the soft-deleted record with the new role
      existing.roleId = dto.roleId;
      existing.status = (dto.status as MembershipStatus) ?? MembershipStatus.ACTIVE;
      existing.joinedAt = new Date();
      saved = await this.membershipsRepository.save(existing);
    } else {
      const membership = this.membershipsRepository.create({
        userId: dto.userId,
        tenantId: dto.tenantId,
        roleId: dto.roleId,
        status: (dto.status as MembershipStatus) ?? MembershipStatus.ACTIVE,
        joinedAt: new Date(),
      });
      saved = await this.membershipsRepository.save(membership);
    }

    // Publish tenant.user-added event
    this.rabbitMqPublisher.publish('chassis.tenants', 'tenant.user-added', {
      tenantId: dto.tenantId,
      userId: dto.userId,
      role: role.name,
      timestamp: new Date().toISOString(),
    });

    this.logger.log(
      `Created membership for user ${dto.userId} in tenant ${dto.tenantId} with role ${role.name}`,
    );

    return saved;
  }

  async remove(userId: string, tenantId: string): Promise<void> {
    const membership = await this.findByUserAndTenant(userId, tenantId);
    if (!membership) {
      throw new NotFoundException(
        `No membership found for user ${userId} in tenant ${tenantId}`,
      );
    }
    membership.status = MembershipStatus.REMOVED;
    await this.membershipsRepository.save(membership);
  }
}
