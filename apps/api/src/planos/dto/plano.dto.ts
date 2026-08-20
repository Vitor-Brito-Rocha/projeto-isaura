import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreatePlanoDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  nome!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  disciplina?: string;

  @IsInt()
  @Min(2000)
  @Max(2100)
  anoLetivo!: number;

  /** 1 ou 2. Omitido = ano letivo inteiro. Ver `Cadeira.semestre`. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2)
  semestre?: number;
}

export class UpdatePlanoDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  nome?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  disciplina?: string;

  @IsOptional()
  @IsInt()
  @Min(2000)
  @Max(2100)
  anoLetivo?: number;

  /** 1, 2 ou `null` para voltar ao ano inteiro. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2)
  semestre?: number | null;
}

/** Uma unidade vinda do documento, já conferida por ela na tela. */
export class UnidadeImportadaDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  titulo!: string;

  @IsArray()
  @ArrayMaxSize(60)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(200, { each: true })
  topicos!: string[];

  /**
   * O período estimado a partir das horas-aula (ver `planos/cronograma.ts`).
   *
   * Opcional porque o caminho do modelo não estima nada — ele lê documento de
   * formato livre, sem carga horária nem calendário. Quando vem, é o que acorda
   * o aviso de ritmo do `progresso/calcular.ts`, que hoje nunca aparece por
   * falta deste dado.
   */
  @IsOptional()
  @IsDateString()
  dataInicio?: string;

  @IsOptional()
  @IsDateString()
  dataFimPrevista?: string;
}

/**
 * O que ela confirmou da importação. Os tetos repetem os de `plano.prompt.ts`:
 * lá evitam mandar lixo ao banco, aqui evitam confiar no que chega do cliente —
 * o rascunho passa pelo navegador, então o servidor valida de novo.
 */
export class ImportarUnidadesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => UnidadeImportadaDto)
  unidades!: UnidadeImportadaDto[];
}

export class CreateUnidadeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  titulo!: string;

  /** Omitido = vai para o fim da lista. */
  @IsOptional()
  @IsInt()
  @Min(1)
  ordem?: number;

  @IsOptional()
  @IsString()
  dataInicio?: string;

  @IsOptional()
  @IsString()
  dataFimPrevista?: string;
}

export class UpdateUnidadeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  titulo?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  ordem?: number;

  @IsOptional()
  @IsString()
  dataInicio?: string;

  @IsOptional()
  @IsString()
  dataFimPrevista?: string;
}

export class CreateTopicoDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  titulo!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  ordem?: number;
}

export class UpdateTopicoDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  titulo?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  ordem?: number;
}
