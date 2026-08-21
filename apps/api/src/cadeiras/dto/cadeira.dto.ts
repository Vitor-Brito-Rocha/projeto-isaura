import {
  IsHexColor,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateCadeiraDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  disciplina!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(60)
  turma!: string;

  @IsInt()
  @Min(2000)
  @Max(2100)
  anoLetivo!: number;

  /** 1 ou 2. Omitido = ano letivo inteiro, que é o caso da escola básica. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2)
  semestre?: number;

  @IsOptional()
  @IsUUID()
  escolaId?: string;

  @IsOptional()
  @IsHexColor()
  corHex?: string;

  /** Qual currículo esta turma segue. Turmas irmãs apontam para o mesmo. */
  @IsOptional()
  @IsUUID()
  planoCurricularId?: string;
}

export class UpdateCadeiraDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  disciplina?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  turma?: string;

  @IsOptional()
  @IsInt()
  @Min(2000)
  @Max(2100)
  anoLetivo?: number;

  /**
   * 1, 2 ou `null` para voltar ao ano inteiro.
   *
   * `@IsOptional` deixa `null` passar (ele ignora null e undefined), e é o que
   * permite LIMPAR o semestre: `null` chega ao Prisma e zera a coluna, enquanto
   * `undefined` não mexe nela.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2)
  semestre?: number | null;

  @IsOptional()
  @IsUUID()
  escolaId?: string;

  @IsOptional()
  @IsHexColor()
  corHex?: string;

  @IsOptional()
  @IsUUID()
  planoCurricularId?: string;

  // `ativo` NÃO entra aqui. Arquivar é `DELETE /cadeiras/:id` e reativar é
  // `POST /cadeiras/:id/reativar`: os dois mexem nas ocorrências e nos alarmes,
  // e um `PATCH { ativo }` daria a volta nos dois — gravando a coluna e
  // deixando a grade cancelada com a turma de pé na tela.
}
