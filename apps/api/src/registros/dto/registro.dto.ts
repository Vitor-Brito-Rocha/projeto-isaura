import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

/** O alarme de abertura pergunta uma coisa só: o que você planeja dar? */
export class SalvarAberturaDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  planoPrevisto?: string;
}

export class SalvarFechamentoDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  conteudoDado?: string;

  @IsOptional()
  @IsUUID()
  unidadeId?: string;

  /** Ids de Topico. Substitui a lista inteira — o formulário manda o estado final. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  topicosCobertos?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  atividadeCasa?: string;

  /** "2026-03-20" */
  @IsOptional()
  @IsString()
  dataEntrega?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  planoProximaAula?: string;
}
