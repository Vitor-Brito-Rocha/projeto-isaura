import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Frequencia } from '@prisma/client';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class HorarioDto {
  @IsInt()
  @Min(0)
  @Max(6)
  diaSemana!: number;

  @Matches(HHMM, { message: 'horaInicio deve estar no formato HH:mm.' })
  horaInicio!: string;

  @Matches(HHMM, { message: 'horaFim deve estar no formato HH:mm.' })
  horaFim!: string;
}

export class CreateSerieDto {
  @IsUUID()
  cadeiraId!: string;

  @IsEnum(Frequencia)
  frequencia!: Frequencia;

  @IsDateString()
  dataInicio!: string; // "YYYY-MM-DD"

  @IsOptional()
  @IsDateString()
  dataFim?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7 * 4) // teto generoso; evita payload absurdo
  @ValidateNested({ each: true })
  @Type(() => HorarioDto)
  horarios!: HorarioDto[];
}

export class UpdateSerieDto {
  @IsOptional()
  @IsEnum(Frequencia)
  frequencia?: Frequencia;

  @IsOptional()
  @IsDateString()
  dataInicio?: string;

  @IsOptional()
  @IsDateString()
  dataFim?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7 * 4)
  @ValidateNested({ each: true })
  @Type(() => HorarioDto)
  horarios?: HorarioDto[];
}
