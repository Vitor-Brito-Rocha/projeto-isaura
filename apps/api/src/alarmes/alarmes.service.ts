import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { StatusOcorrencia, TipoNotificacao } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';
import { hhmmNaTz } from '../common/tz';
import { resolverAlarme } from './resolver-alarme';

/**
 * Teto de antecedência/atraso aceito pelo DTO (`UpdatePerfilDto`,
 * `UpsertConfigAlarmeDto`). A janela de busca é dimensionada por ele: aceitar
 * uma antecedência maior que a janela criaria um alarme que nunca é encontrado.
 */
export const MAX_DESLOCAMENTO_MIN = 120;

/**
 * Quanto atraso ainda vale a pena tocar.
 *
 * Assimétrico de propósito. Alarme de ABERTURA envelhece rápido: perguntar "o
 * que você planeja dar?" meia hora depois da aula ter começado é pior que
 * silêncio. O de FECHAMENTO continua útil por horas — ela pode registrar a aula
 * no intervalo, no fim do turno, no ônibus. Um número só para os dois faria um
 * deles errado.
 */
export const TOLERANCIA_ABERTURA_MIN = 30;
export const TOLERANCIA_FECHAMENTO_MIN = 180;

const MIN = 60_000;

@Injectable()
export class AlarmesService {
  private readonly logger = new Logger(AlarmesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  private async protegido<T>(nome: string, fn: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      const mensagem = e instanceof Error ? e.message : String(e);
      this.logger.error(`Cron ${nome} falhou: ${mensagem}`, e instanceof Error ? e.stack : undefined);
      return fallback;
    }
  }

  /** "o que você planeja dar?" — antes do início. */
  @Cron(CronExpression.EVERY_MINUTE)
  async alarmeAbertura(agora: Date = new Date()): Promise<number> {
    return this.protegido(
      'alarmeAbertura',
      async () => {
        // Rede larga. Resolvendo a inequação `agora - tolerância <= inicioEm -
        // antecedência <= agora` para todos os valores possíveis de antecedência
        // [0, MAX], sobra esta janela — que o índice [status, inicioEm] cobre.
        const candidatos = await this.prisma.ocorrencia.findMany({
          where: {
            status: StatusOcorrencia.AGENDADA,
            aberturaNotificadaEm: null,
            inicioEm: {
              gte: new Date(agora.getTime() - TOLERANCIA_ABERTURA_MIN * MIN),
              lte: new Date(agora.getTime() + MAX_DESLOCAMENTO_MIN * MIN),
            },
          },
          include: {
            cadeira: { include: { config: true } },
            professor: true,
          },
        });

        let enviados = 0;
        for (const oc of candidatos) {
          const cfg = resolverAlarme(oc.professor, oc.cadeira.config);
          const dispararEm = oc.inicioEm.getTime() - cfg.antecedenciaMin * MIN;

          if (dispararEm > agora.getTime()) continue; // ainda não é hora
          // Atrasado demais: a linha fica com a marca nula e simplesmente sai
          // da janela no próximo tick. Sem lixo, sem varredura crescente.
          if (dispararEm < agora.getTime() - TOLERANCIA_ABERTURA_MIN * MIN) continue;

          if (!(await this.reivindicar(oc.id, 'abertura'))) continue;

          const hora = hhmmNaTz(oc.inicioEm, oc.professor.timezone);
          await this.push.enviarPush(oc.professorId, {
            title: `${oc.cadeira.disciplina} · ${oc.cadeira.turma}`,
            body: `Sua aula das ${hora} está chegando. O que você planeja dar?`,
            url: `/aula/${oc.id}?momento=abertura`,
            ocorrenciaId: oc.id,
            tag: `abertura-${oc.id}`,
            tipo: TipoNotificacao.ABERTURA_AULA,
            intensidade: cfg.intensidadeAbertura,
            som: cfg.som,
            vibra: cfg.vibra,
            actions: [{ action: 'registrar', title: 'Registrar' }],
          });
          enviados++;
        }

        if (enviados > 0) this.logger.log(`Alarmes de abertura enviados: ${enviados}`);
        return enviados;
      },
      0,
    );
  }

  /** "o que você deu?" — depois do fim, enquanto está fresco. */
  @Cron(CronExpression.EVERY_MINUTE)
  async alarmeFechamento(agora: Date = new Date()): Promise<number> {
    return this.protegido(
      'alarmeFechamento',
      async () => {
        // Mesma inequação, do outro lado: `agora - tolerância <= fimEm + atraso
        // <= agora`, com atraso em [0, MAX]. A janela fica toda no passado.
        const candidatos = await this.prisma.ocorrencia.findMany({
          where: {
            status: StatusOcorrencia.AGENDADA,
            fechamentoNotificadoEm: null,
            fimEm: {
              gte: new Date(
                agora.getTime() - (TOLERANCIA_FECHAMENTO_MIN + MAX_DESLOCAMENTO_MIN) * MIN,
              ),
              lte: new Date(agora.getTime()),
            },
          },
          include: {
            cadeira: { include: { config: true } },
            professor: true,
          },
        });

        let enviados = 0;
        for (const oc of candidatos) {
          const cfg = resolverAlarme(oc.professor, oc.cadeira.config);
          const dispararEm = oc.fimEm.getTime() + cfg.atrasoMin * MIN;

          if (dispararEm > agora.getTime()) continue;
          if (dispararEm < agora.getTime() - TOLERANCIA_FECHAMENTO_MIN * MIN) continue;

          if (!(await this.reivindicar(oc.id, 'fechamento'))) continue;

          const hora = hhmmNaTz(oc.fimEm, oc.professor.timezone);
          await this.push.enviarPush(oc.professorId, {
            title: `${oc.cadeira.disciplina} · ${oc.cadeira.turma}`,
            body: `A aula terminou às ${hora}. O que você deu?`,
            url: `/aula/${oc.id}?momento=fechamento`,
            ocorrenciaId: oc.id,
            tag: `fechamento-${oc.id}`,
            tipo: TipoNotificacao.FECHAMENTO_AULA,
            intensidade: cfg.intensidadeFechamento,
            som: cfg.som,
            vibra: cfg.vibra,
            actions: [{ action: 'registrar', title: 'Registrar' }],
          });
          enviados++;
        }

        if (enviados > 0) this.logger.log(`Alarmes de fechamento enviados: ${enviados}`);
        return enviados;
      },
      0,
    );
  }

  /**
   * Reivindica a ocorrência antes de enviar.
   *
   * `updateMany` condicional em "IS NULL" é atômico no Postgres: se voltar
   * `count 0`, outro tick já pegou esta linha e este aqui deve desistir. É o
   * que impede push duplicado quando dois ticks se sobrepõem — o caso real é
   * um deploy no meio do minuto, com a instância velha e a nova varrendo juntas.
   *
   * Marca ANTES de enviar, e não depois, de propósito: duplicar um alarme é
   * pior do que perder um. Perder aparece na central in-app; duplicar treina a
   * professora a ignorar o alarme.
   */
  private async reivindicar(id: string, qual: 'abertura' | 'fechamento'): Promise<boolean> {
    const campo = qual === 'abertura' ? 'aberturaNotificadaEm' : 'fechamentoNotificadoEm';
    const { count } = await this.prisma.ocorrencia.updateMany({
      where: { id, [campo]: null },
      data: { [campo]: new Date() },
    });
    return count > 0;
  }
}
