import {
  IsBoolean,
  IsHexColor,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateCadeiraDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  disciplina!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(60)
  turma!: string;

  @IsInt()
  @Min(2000)
  @Max(2100)
  anoLetivo!: number;

  @IsOptional()
  @IsUUID()
  escolaId?: string;

  @IsOptional()
  @IsHexColor()
  corHex?: string;

  /** Qual currículo esta turma segue. Turmas irmãs apontam para o mesmo. */
  @IsOptional()
  @IsUUID()
  planoCurricularId?: string;
}

export class UpdateCadeiraDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  disciplina?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  turma?: string;

  @IsOptional()
  @IsInt()
  @Min(2000)
  @Max(2100)
  anoLetivo?: number;

  @IsOptional()
  @IsUUID()
  escolaId?: string;

  @IsOptional()
  @IsHexColor()
  corHex?: string;

  @IsOptional()
  @IsUUID()
  planoCurricularId?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
