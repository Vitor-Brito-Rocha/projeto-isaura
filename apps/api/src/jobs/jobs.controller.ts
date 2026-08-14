import { Controller, ForbiddenException, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JobsService } from './jobs.service';

/**
 * Disparo manual dos crons — existe para desenvolvimento e para o roteiro de
 * verificação (não dá para esperar as 3h da manhã só para conferir que a grade
 * foi gerada).
 *
 * Exige autenticação como qualquer outra rota (o guard é global) e é bloqueado
 * em produção: um endpoint que dispara varredura global não deve ficar exposto,
 * mesmo autenticado, porque o custo dele não é proporcional ao professor que
 * chamou.
 */
@Controller('jobs')
export class JobsController {
  constructor(
    private readonly jobs: JobsService,
    private readonly config: ConfigService,
  ) {}

  private garantirNaoProducao() {
    if (this.config.get<string>('NODE_ENV') === 'production') {
      throw new ForbiddenException('Disparo manual de jobs está desabilitado em produção.');
    }
  }

  @Post('gerar-ocorrencias')
  async gerarOcorrencias() {
    this.garantirNaoProducao();
    return { geradas: await this.jobs.gerarOcorrencias() };
  }
}
