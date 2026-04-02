import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Role } from './entities/role.entity';
import { Permission } from './entities/permission.entity';

@Injectable()
export class RolesService {
  private readonly logger = new Logger(RolesService.name);

  constructor(
    @InjectRepository(Role)
    private readonly rolesRepository: Repository<Role>,
    @InjectRepository(Permission)
    private readonly permissionsRepository: Repository<Permission>,
  ) {}

  async findAll(tenantId?: string): Promise<Role[]> {
    if (tenantId) {
      return this.rolesRepository.find({
        where: [{ tenantId }, { tenantId: IsNull() }],
        order: { name: 'ASC' },
      });
    }
    return this.rolesRepository.find({ order: { name: 'ASC' } });
  }

  async findById(id: string): Promise<Role> {
    const role = await this.rolesRepository.findOne({
      where: { id },
      relations: ['permissions'],
    });
    if (!role) {
      throw new NotFoundException(`Role with ID ${id} not found`);
    }
    return role;
  }

  async findByName(
    name: string,
    tenantId?: string | null,
  ): Promise<Role | null> {
    return this.rolesRepository.findOne({
      where: { name, tenantId: tenantId ?? IsNull() },
      relations: ['permissions'],
    });
  }

  async getPermissionsForRole(roleId: string): Promise<string[]> {
    const role = await this.findById(roleId);
    return role.permissions.map((p) => `${p.resource}:${p.action}`);
  }

  async findAllPermissions(): Promise<Permission[]> {
    return this.permissionsRepository.find({
      order: { resource: 'ASC', action: 'ASC' },
    });
  }
}
