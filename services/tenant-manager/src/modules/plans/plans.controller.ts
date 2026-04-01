import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { PlansService } from './plans.service';
import { ApiResponseDto } from '../../common/dto/api-response.dto';
import { Plan } from './entities/plan.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('api/v1/plans')
@UseGuards(JwtAuthGuard)
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Get()
  async findAll(): Promise<ApiResponseDto<Plan[]>> {
    const plans = await this.plansService.findAll();
    return ApiResponseDto.ok(plans);
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<ApiResponseDto<Plan>> {
    const plan = await this.plansService.findById(id);
    return ApiResponseDto.ok(plan);
  }
}
