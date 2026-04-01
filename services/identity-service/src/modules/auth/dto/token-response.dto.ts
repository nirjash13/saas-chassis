import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class TokenResponseDto {
  accessToken!: string;
  refreshToken!: string;
  expiresIn!: number;
  tokenType!: string;
}

export class AccessTokenResponseDto {
  accessToken!: string;
  expiresIn!: number;
  tokenType!: string;
}

export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

export class SwitchTenantDto {
  @IsUUID()
  @IsNotEmpty()
  tenantId!: string;
}
