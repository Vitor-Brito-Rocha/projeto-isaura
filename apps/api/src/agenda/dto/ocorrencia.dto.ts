import { Type } from 'class-transformer';
import { FiltroExportacaoDto } from '../../common/filtro-exportacao.dto';
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

/**
 * Pendências herdam o mesmo recorte do histórico.
 *
 * Ela pensa num recorte só — "o segundo semestre do 8º ano" — e faz as duas
 * perguntas com ele: o que eu dei, e o que falta registrar. Duas listas de
 * filtro divergiriam no primeiro campo novo.
 */
export class ListarPendenciasDto extends FiltroExportacaoDto {
  /**
   * Janela para trás, em dias. O teto de um ano é o do ano letivo: mais que
   * isso não é "lembrei depois", é outra tela (histórico, fase 5).
   *
   * Convive com `de`/`ate` do filtro: `dias` é o padrão da tela, e o intervalo
   * explícito é o que ela usa quando exporta um bimestre fechado.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  dias?: number;

  /**
   * A tela mostra as 60 mais recentes; a exportação precisa de todas do
   * recorte. Sem isto, o arquivo sairia truncado sem dizer que truncou — que é
   * o mesmo erro que o CSV do histórico já evita rebuscando tudo.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2000)
  limite?: number;
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
