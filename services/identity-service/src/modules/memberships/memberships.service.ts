import {
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientProxy } from '@nestjs/microservices';
import { Membership, MembershipStatus } from './entities/membership.entity';
import { CreateMembershipDto } from './dto/create-membership.dto';
import { RolesService } from '../roles/roles.service';

@Injectable()
export class MembershipsService {
  private readonly logger = new Logger(MembershipsService.name);

  constructor(
    @InjectRepository(Membership)
    private readonly membershipsRepository: Repository<Membership>,
    @Inject(forwardRef(() => RolesService))
    private readonly rolesService: RolesService,
    @Optional()
    @Inject('RABBITMQ_CLIENT')
    private readonly client: ClientProxy | null,
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
    const existing = await this.findByUserAndTenant(dto.userId, dto.tenantId);
    if (existing) {
      throw new ConflictException(
        `User ${dto.userId} already has a membership in tenant ${dto.tenantId}`,
      );
    }

    // Validate the role exists
    const role = await this.rolesService.findById(dto.roleId);

    const membership = this.membershipsRepository.create({
      userId: dto.userId,
      tenantId: dto.tenantId,
      roleId: dto.roleId,
      status: (dto.status as MembershipStatus) ?? MembershipStatus.ACTIVE,
      joinedAt: new Date(),
    });

    const saved = await this.membershipsRepository.save(membership);

    // Publish tenant.user-added event
    if (this.client) {
      this.client
        .emit('tenant.user-added', {
          tenantId: dto.tenantId,
          userId: dto.userId,
          role: role.name,
          timestamp: new Date().toISOString(),
        })
        .subscribe({
          error: (err: Error) =>
            this.logger.warn(
              `Failed to publish tenant.user-added: ${err.message}`,
            ),
        });
    }

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
