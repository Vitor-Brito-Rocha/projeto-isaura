import { Transform } from 'class-transformer';
import { IsArray, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

/**
 * O recorte que vale para o histórico E para as pendências.
 *
 * Uma classe só porque a professora pensa num recorte só — "o segundo semestre
 * do 8º ano" — e responde as duas perguntas com ele: *o que eu dei* e *o que
 * falta registrar*. Duas listas de filtro divergiriam no primeiro campo novo.
 */
export class FiltroExportacaoDto {
  /**
   * Conjunto, não uma cadeira só.
   *
   * Ela dá a mesma disciplina para várias turmas. Com o filtro singular que
   * existia antes, "exportar Matemática" eram quatro exportações coladas à mão
   * — o pedido não era atendível, não era só incômodo.
   *
   * Aceita `?cadeiraIds=a,b,c` porque o mesmo texto de consulta vai parar no
   * link do relatório de impressão, e repetir a chave deixa a URL ilegível.
   */
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.split(',').filter(Boolean) : value,
  )
  @IsArray()
  @IsUUID('4', { each: true })
  cadeiraIds?: string[];

  /**
   * Atalho para "todas as turmas desta disciplina".
   *
   * Convive com `cadeiraIds` em vez de substituí-lo: ela pode querer três das
   * quatro turmas de Matemática, e aí a disciplina não descreve a escolha.
   */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  disciplina?: string;

  /**
   * Período letivo pelo campo, não por intervalo de datas.
   *
   * A tentação é traduzir "2026.1" para 01/02–30/06 e filtrar por data. Isso é
   * chute: nenhum calendário de semestre está gravado, e escola e faculdade
   * começam em datas diferentes. `anoLetivo` e `semestre` são colunas da
   * `Cadeira` — filtrar por elas é exato. Quem quer recorte mais fino usa
   * `de`/`ate`, que continuam existindo.
   */
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(2000)
  anoLetivo?: number;

  @IsOptional()
  @Transform(({ value }) => (value === '' || value === undefined ? undefined : Number(value)))
  @IsIn([1, 2])
  semestre?: number;

  @IsOptional()
  @IsDateString()
  de?: string;

  @IsOptional()
  @IsDateString()
  ate?: string;
}
