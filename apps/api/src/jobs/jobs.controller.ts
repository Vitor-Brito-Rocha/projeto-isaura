import { Controller, ForbiddenException, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AlarmesService } from '../alarmes/alarmes.service';
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
    private readonly alarmes: AlarmesService,
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

  /**
   * Os dois alarmes, disparados na mão. É o que torna o "teste de relógio"
   * possível sem esperar o minuto virar: cadastra uma aula terminando agora,
   * chama isto, e o push tem de chegar no aparelho.
   */
  @Post('alarme-abertura')
  async alarmeAbertura() {
    this.garantirNaoProducao();
    return { enviados: await this.alarmes.alarmeAbertura() };
  }

  @Post('alarme-fechamento')
  async alarmeFechamento() {
    this.garantirNaoProducao();
    return { enviados: await this.alarmes.alarmeFechamento() };
  }
}
