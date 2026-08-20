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

/**
 * Uma grade vinda de um calendário EXPLÍCITO, e não de uma regra de recorrência.
 *
 * O `Plano de Ensino` da Unifor traz as datas de aula uma a uma, com os dias
 * sem aula já removidos. Materializar isso como `SerieAula` semanal criaria as
 * aulas nos feriados que o calendário da universidade exclui — e o estrago não
 * é a linha a mais na grade, é o alarme tocando num dia em que ela não tem aula.
 *
 * Marcá-las como feriado depois também não resolve: `materializarFaltantes` só
 * cria 60 dias à frente, então metade do semestre nem existe ainda no banco na
 * hora da importação, e o cron criaria as excedentes como AGENDADA mais tarde.
 * Por isso as ocorrências nascem diretamente nas datas do documento, sem série.
 */
export class GradeDoCalendarioDto {
  @IsUUID()
  cadeiraId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => HorarioDto)
  horarios!: HorarioDto[];

  /** "YYYY-MM-DD". Teto generoso: um ano de duas aulas por semana dá ~80. */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(250)
  @IsDateString({}, { each: true })
  datas!: string[];
}
