import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, Min, MaxLength } from 'class-validator';
import { IntensidadeAlarme } from '@prisma/client';

export class UpdatePerfilDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  nome?: string;

  /** IANA (ex.: "America/Sao_Paulo", "America/Rio_Branco"). */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  // Teto de 120 min porque o cron varre uma janela fixa à frente do instante de
  // início (ver AlarmesService.JANELA_BUSCA_MIN). Aceitar antecedência maior que
  // essa janela criaria um alarme que nunca é encontrado.
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  antecedenciaPadraoMin?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  atrasoPadraoMin?: number;

  @IsOptional()
  @IsEnum(IntensidadeAlarme)
  intensidadeAberturaPadrao?: IntensidadeAlarme;

  @IsOptional()
  @IsEnum(IntensidadeAlarme)
  intensidadeFechamentoPadrao?: IntensidadeAlarme;

  @IsOptional()
  @IsBoolean()
  somPadrao?: boolean;

  @IsOptional()
  @IsBoolean()
  vibraPadrao?: boolean;
}
