import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

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
