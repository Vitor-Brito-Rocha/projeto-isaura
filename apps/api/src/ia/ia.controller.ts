import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthProfessor, CurrentProfessor } from '../auth/current-professor.decorator';
import { GerarResumoDto } from './dto/resumo.dto';
import { ResumoService } from './resumo.service';

@Controller('ia')
export class IaController {
  constructor(private readonly resumo: ResumoService) {}

  /** A tela pergunta antes de mostrar o botão de ditado. */
  @Get('status')
  status() {
    return { resumo: this.resumo.ativo };
  }

  /**
   * Limite bem abaixo dos 100/min globais: cada chamada custa dinheiro e chama
   * um serviço de terceiro. Onze cadeiras num dia não passam de dez por minuto,
   * então o teto só encosta em laço acidental da tela.
   */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('ocorrencia/:ocorrenciaId/resumo')
  gerar(
    @CurrentProfessor() p: AuthProfessor,
    @Param('ocorrenciaId') ocorrenciaId: string,
    @Body() dto: GerarResumoDto,
  ) {
    return this.resumo.gerar(p.id, ocorrenciaId, dto.transcricao);
  }
}
