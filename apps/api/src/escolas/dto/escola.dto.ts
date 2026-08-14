import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateEscolaDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  nome!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  turno?: string;
}

export class UpdateEscolaDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  nome?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  turno?: string;
}
