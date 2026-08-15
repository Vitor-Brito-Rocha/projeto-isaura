import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { StatusOcorrencia } from '@prisma/client';

export class ListarAgendaDto {
  @IsDateString()
  de!: string; // "YYYY-MM-DD"

  @IsDateString()
  ate!: string;

  @IsOptional()
  @IsUUID()
  cadeiraId?: string;
}

export class ListarPendenciasDto {
  /**
   * Janela para trás, em dias. O teto de um ano é o do ano letivo: mais que
   * isso não é "lembrei depois", é outra tela (histórico, fase 5).
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  dias?: number;
}

export class UpdateOcorrenciaDto {
  @IsOptional()
  @IsEnum(StatusOcorrencia)
  status?: StatusOcorrencia;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacao?: string;
}
