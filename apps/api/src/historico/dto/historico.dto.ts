import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class ConsultaHistoricoDto {
  @IsOptional()
  @IsUUID()
  cadeiraId?: string;

  /**
   * Termo livre. O teto não é sobre banco: `contains` com uma string enorme
   * varre 500 registros do mesmo jeito — é para o parâmetro não virar carona
   * de payload.
   */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  busca?: string;

  @IsOptional()
  @IsDateString()
  de?: string;

  @IsOptional()
  @IsDateString()
  ate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pagina?: number;

  /** O serviço recorta em 500; a tela de relatório pede tudo de uma vez. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  tamanho?: number;
}
