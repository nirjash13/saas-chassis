import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { hashSync } from 'bcryptjs';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Membership } from '../memberships/entities/membership.entity';

const SALT_ROUNDS = 12;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Membership)
    private readonly membershipsRepository: Repository<Membership>,
  ) {}

  async findAll(requestingUser: {
    isPlatformAdmin: boolean;
    tenantId?: string | null;
  }): Promise<User[]> {
    if (requestingUser.isPlatformAdmin) {
      return this.usersRepository.find({ order: { createdAt: 'DESC' } });
    }

    if (!requestingUser.tenantId) {
      return [];
    }

    // Tenant admin: return only members of their tenant
    const memberships = await this.membershipsRepository.find({
      where: { tenantId: requestingUser.tenantId },
      relations: ['user'],
    });

    return memberships.map((m) => m.user).filter(Boolean);
  }

  async findById(id: string): Promise<User> {
    const user = await this.usersRepository.findOne({
      where: { id },
      relations: ['memberships', 'memberships.role'],
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { email: email.toLowerCase() },
    });
  }

  async create(dto: CreateUserDto): Promise<User> {
    const existing = await this.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException(
        `A user with email ${dto.email} already exists`,
      );
    }

    const user = this.usersRepository.create({
      email: dto.email.toLowerCase(),
      passwordHash: hashSync(dto.password, SALT_ROUNDS),
      displayName: dto.displayName,
      phone: dto.phone ?? null,
      isPlatformAdmin: dto.isPlatformAdmin ?? false,
      emailVerified: dto.emailVerified ?? false,
      isActive: true,
    });

    const saved = await this.usersRepository.save(user);
    this.logger.log(`Created user ${saved.id} (${saved.email})`);
    return saved;
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.findById(id);

    if (dto.displayName !== undefined) user.displayName = dto.displayName;
    if (dto.phone !== undefined) user.phone = dto.phone ?? null;
    if (dto.avatarUrl !== undefined) user.avatarUrl = dto.avatarUrl ?? null;
    if (dto.isActive !== undefined) user.isActive = dto.isActive;
    if (dto.emailVerified !== undefined) user.emailVerified = dto.emailVerified;

    return this.usersRepository.save(user);
  }

  async softDelete(id: string): Promise<void> {
    const user = await this.findById(id);
    user.isActive = false;
    await this.usersRepository.save(user);
    this.logger.log(`Soft-deleted user ${id}`);
  }

  async updateLastLogin(id: string): Promise<void> {
    await this.usersRepository.update(id, { lastLoginAt: new Date() });
  }
}
