import { IsBoolean, IsNotEmpty } from 'class-validator';

export class ToggleFeatureDto {
  @IsNotEmpty()
  @IsBoolean()
  enabled!: boolean;
}
