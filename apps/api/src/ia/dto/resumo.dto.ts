import { IsString, MaxLength, MinLength } from 'class-validator';

export class GerarResumoDto {
  /**
   * A fala transcrita, como saiu do ditado. Vai para `transcricaoBruta`
   * intacta: é ela que a professora compara com o rascunho para saber se a IA
   * inventou alguma coisa.
   */
  @IsString()
  @MinLength(10, { message: 'Fale um pouco mais — não dá para resumir isso.' })
  @MaxLength(8000)
  transcricao!: string;
}
