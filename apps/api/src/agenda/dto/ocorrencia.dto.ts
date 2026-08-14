import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
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

export class UpdateOcorrenciaDto {
  @IsOptional()
  @IsEnum(StatusOcorrencia)
  status?: StatusOcorrencia;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacao?: string;
}
