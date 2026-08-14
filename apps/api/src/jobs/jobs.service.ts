import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { SeriesService } from '../series/series.service';

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly series: SeriesService,
  ) {}

  /**
   * Roda `fn` protegido: um erro aqui não pode virar unhandled rejection e
   * derrubar o processo (o Node encerra nisso por padrão). Loga com stack e
   * devolve o fallback, mas nunca propaga — um cron quebrado não pode levar a
   * API junto.
   */
  private async protegido<T>(nome: string, fn: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      const mensagem = e instanceof Error ? e.message : String(e);
      const stack = e instanceof Error ? e.stack : undefined;
      this.logger.error(`Cron ${nome} falhou: ${mensagem}`, stack);
      return fallback;
    }
  }

  /**
   * Estende o horizonte de ocorrências de todas as séries ativas.
   *
   * Roda de madrugada em UTC (e não no fuso de ninguém) de propósito: o sistema
   * é multitenant, então não existe "madrugada" que sirva a todos os
   * professores. O que importa é rodar num horário de baixa carga e ser
   * idempotente — materializarFaltantes pode rodar quantas vezes for.
   */
  @Cron('0 6 * * *') // 06:00 UTC = 03:00 em Brasília
  async gerarOcorrencias(): Promise<number> {
    return this.protegido(
      'gerarOcorrencias',
      async () => {
        const series = await this.prisma.serieAula.findMany({
          where: { ativo: true, cadeira: { ativo: true } },
          select: { id: true },
        });

        let total = 0;
        for (const s of series) {
          total += await this.series.materializarFaltantes(s.id);
        }

        if (total > 0) this.logger.log(`Geradas ${total} novas ocorrências.`);
        return total;
      },
      0,
    );
  }
}
