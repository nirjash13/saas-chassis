import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateMembershipDto {
  @IsUUID()
  @IsNotEmpty()
  userId!: string;

  @IsUUID()
  @IsNotEmpty()
  tenantId!: string;

  @IsUUID()
  @IsNotEmpty()
  roleId!: string;

  @IsString()
  @IsOptional()
  status?: string;
}
