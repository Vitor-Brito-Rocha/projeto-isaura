import { IsBoolean, IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { IntensidadeAlarme } from '@prisma/client';
import { MAX_DESLOCAMENTO_MIN } from '../../alarmes/alarmes.service';

/**
 * Override de alarme por cadeira. Todo campo é opcional e **nulo é significativo**:
 * enviar `null` limpa o override e volta a herdar o padrão da conta.
 */
export class UpsertConfigAlarmeDto {
  // O teto vem do motor: a janela de busca do cron é dimensionada por ele, e
  // aceitar antecedência maior criaria um alarme que nunca seria encontrado.
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_DESLOCAMENTO_MIN)
  antecedenciaMin?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_DESLOCAMENTO_MIN)
  atrasoMin?: number | null;

  @IsOptional()
  @IsEnum(IntensidadeAlarme)
  intensidadeAbertura?: IntensidadeAlarme | null;

  @IsOptional()
  @IsEnum(IntensidadeAlarme)
  intensidadeFechamento?: IntensidadeAlarme | null;

  @IsOptional()
  @IsBoolean()
  som?: boolean | null;

  @IsOptional()
  @IsBoolean()
  vibra?: boolean | null;
}
