import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Plan } from './entities/plan.entity';

@Injectable()
export class PlansService {
  private readonly logger = new Logger(PlansService.name);

  constructor(
    @InjectRepository(Plan)
    private readonly planRepo: Repository<Plan>,
  ) {}

  async findAll(): Promise<Plan[]> {
    return this.planRepo.find({
      where: { isActive: true },
      order: { sortOrder: 'ASC' },
    });
  }

  async findById(id: string): Promise<Plan> {
    const plan = await this.planRepo.findOne({ where: { id } });
    if (!plan) {
      throw new NotFoundException(`Plan with ID ${id} not found`);
    }
    return plan;
  }

  async findByCode(code: string): Promise<Plan> {
    const plan = await this.planRepo.findOne({ where: { code } });
    if (!plan) {
      this.logger.warn(`Plan with code '${code}' not found, falling back to free`);
      const freePlan = await this.planRepo.findOne({ where: { code: 'free' } });
      if (!freePlan) {
        // Return a minimal default plan if DB has no seeded plans yet
        return {
          id: 'default',
          code: 'free',
          name: 'Free',
          description: null,
          priceMonthly: 0,
          priceYearly: null,
          stripePriceIdMonthly: null,
          stripePriceIdYearly: null,
          maxUsers: 5,
          maxUnits: 1,
          includedFeatures: ['module.financial_core', 'module.universal_ledger'],
          isActive: true,
          sortOrder: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as Plan;
      }
      return freePlan;
    }
    return plan;
  }
}
