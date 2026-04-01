import { IsNotEmpty, IsString, IsUUID, MinLength } from 'class-validator';

export class ImpersonateDto {
  @IsUUID()
  @IsNotEmpty()
  targetUserId!: string;

  @IsUUID()
  @IsNotEmpty()
  targetTenantId!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(10, { message: 'Reason must be at least 10 characters long' })
  reason!: string;
}
