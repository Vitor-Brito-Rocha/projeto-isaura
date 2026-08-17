import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { FiltroExportacaoDto } from '../../common/filtro-exportacao.dto';

export class ConsultaHistoricoDto extends FiltroExportacaoDto {
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
