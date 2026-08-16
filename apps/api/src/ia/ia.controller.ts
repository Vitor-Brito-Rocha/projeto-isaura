import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthProfessor, CurrentProfessor } from '../auth/current-professor.decorator';
import { GerarResumoDto } from './dto/resumo.dto';
import { ImportacaoService } from './importacao.service';
import { ResumoService } from './resumo.service';

@Controller('ia')
export class IaController {
  constructor(
    private readonly resumo: ResumoService,
    private readonly importacao: ImportacaoService,
  ) {}

  /** A tela pergunta antes de mostrar o botão de ditado. */
  @Get('status')
  status() {
    // O provedor vai junto porque a resposta muda de qualidade com ele, e
    // descobrir qual está ativo não pode depender de ler log de servidor.
    return { resumo: this.resumo.ativo, provedor: this.resumo.provedorAtual };
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

  /**
   * Lê o PDF do plano e devolve a estrutura. **Não grava nada** — quem cria as
   * unidades é ela, confirmando na tela.
   *
   * Mesmo teto do resumo: chama serviço de terceiro e lê um arquivo inteiro.
   */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('plano/:planoId/anexo/:anexoId/extrair')
  extrairPlano(
    @CurrentProfessor() p: AuthProfessor,
    @Param('planoId') planoId: string,
    @Param('anexoId') anexoId: string,
  ) {
    return this.importacao.extrair(p.id, planoId, anexoId);
  }
}
