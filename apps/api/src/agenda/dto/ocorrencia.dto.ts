import { Type } from 'class-transformer';
import {
  IsBoolean,
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

  /**
   * Ao cancelar: leva o plano desta aula para a próxima da mesma turma.
   *
   * A aula caiu, o conteúdo não. Sem isto ela reescreveria na quinta o que já
   * tinha escrito para a terça — e é justamente o retrabalho que faz onze
   * cadeiras virarem insustentáveis.
   *
   * Só vale com `status` de cancelamento; o servidor devolve o que conseguiu
   * fazer, porque "a próxima aula" nem sempre existe.
   */
  @IsOptional()
  @IsBoolean()
  transferirPlano?: boolean;
}
