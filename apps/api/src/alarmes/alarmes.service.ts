import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { StatusOcorrencia, TipoNotificacao } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';
import { ErrosService } from '../common/erros.service';
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
    private readonly erros: ErrosService,
  ) {}

  /**
   * Carrega professor e cadeira das ocorrências candidatas em duas consultas.
   *
   * Por que não `include` na varredura: a relação `cadeira` é obrigatória no
   * schema, então o Prisma exige que ela volte. Numa varredura MULTITENANT isso
   * é frágil — basta uma professora apagar uma cadeira no intervalo entre a
   * leitura da ocorrência e a da relação (o cascade não é atômico sob read
   * committed) para o `findMany` inteiro estourar. Como `protegido()` engole a
   * exceção e devolve 0, o efeito real seria perder o alarme de TODO MUNDO
   * naquele minuto por causa de uma linha alheia.
   *
   * Com o contexto carregado à parte, cadeira ausente vira "pula esta linha" —
   * que é a semântica correta, já que a ocorrência está sendo apagada de
   * qualquer forma. Continua sendo O(1) em consultas, não N+1.
   */
  private async carregarContexto(ocorrencias: Array<{ professorId: string; cadeiraId: string }>) {
    const professorIds = [...new Set(ocorrencias.map((o) => o.professorId))];
    const cadeiraIds = [...new Set(ocorrencias.map((o) => o.cadeiraId))];

    const [professores, cadeiras] = await Promise.all([
      this.prisma.professor.findMany({ where: { id: { in: professorIds } } }),
      this.prisma.cadeira.findMany({
        where: { id: { in: cadeiraIds } },
        include: { config: true },
      }),
    ]);

    return {
      professorPor: new Map(professores.map((p) => [p.id, p])),
      cadeiraPor: new Map(cadeiras.map((c) => [c.id, c])),
    };
  }

  /**
   * Roda `fn` protegido: um erro aqui não pode virar unhandled rejection e
   * derrubar o processo. Loga com stack, registra em `ErroLog` e alerta o
   * admin por push, mas nunca propaga.
   */
  private async protegido<T>(nome: string, fn: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      const mensagem = e instanceof Error ? e.message : String(e);
      const stack = e instanceof Error ? e.stack : undefined;
      this.logger.error(`Cron ${nome} falhou: ${mensagem}`, stack);
      void this.erros.registrar(`cron:${nome}`, 'CRON', nome, undefined, mensagem, stack);
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
        });

        const { professorPor, cadeiraPor } = await this.carregarContexto(candidatos);

        let enviados = 0;
        for (const oc of candidatos) {
          const professor = professorPor.get(oc.professorId);
          const cadeira = cadeiraPor.get(oc.cadeiraId);
          if (!professor || !cadeira) continue; // apagada no meio da varredura

          const cfg = resolverAlarme(professor, cadeira.config);
          const dispararEm = oc.inicioEm.getTime() - cfg.antecedenciaMin * MIN;

          if (dispararEm > agora.getTime()) continue; // ainda não é hora
          // Atrasado demais: a linha fica com a marca nula e simplesmente sai
          // da janela no próximo tick. Sem lixo, sem varredura crescente.
          if (dispararEm < agora.getTime() - TOLERANCIA_ABERTURA_MIN * MIN) continue;

          if (!(await this.reivindicar(oc.id, 'abertura'))) continue;

          // Isolado por linha: um push que falha é o alarme de uma professora,
          // não o de todas as outras que ainda faltam neste tick.
          try {
            const hora = hhmmNaTz(oc.inicioEm, professor.timezone);
            await this.push.enviarPush(oc.professorId, {
              title: `${cadeira.disciplina} · ${cadeira.turma}`,
              body: `Sua aula das ${hora} está chegando. O que você planeja dar?`,
              url: `/aula?id=${oc.id}&momento=abertura`,
              ocorrenciaId: oc.id,
              tag: `abertura-${oc.id}`,
              tipo: TipoNotificacao.ABERTURA_AULA,
              intensidade: cfg.intensidadeAbertura,
              som: cfg.som,
              vibra: cfg.vibra,
              actions: [{ action: 'registrar', title: 'Registrar' }],
            });
            enviados++;
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            this.logger.error(`Alarme de abertura falhou para a ocorrência ${oc.id}: ${msg}`);
            void this.erros.registrar(
              'cron:alarmeAbertura',
              'CRON',
              `alarmeAbertura/${oc.id}`,
              oc.professorId,
              msg,
              e instanceof Error ? e.stack : undefined,
            );
          }
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
        });

        const { professorPor, cadeiraPor } = await this.carregarContexto(candidatos);

        let enviados = 0;
        for (const oc of candidatos) {
          const professor = professorPor.get(oc.professorId);
          const cadeira = cadeiraPor.get(oc.cadeiraId);
          if (!professor || !cadeira) continue; // apagada no meio da varredura

          const cfg = resolverAlarme(professor, cadeira.config);
          const dispararEm = oc.fimEm.getTime() + cfg.atrasoMin * MIN;

          if (dispararEm > agora.getTime()) continue;
          if (dispararEm < agora.getTime() - TOLERANCIA_FECHAMENTO_MIN * MIN) continue;

          if (!(await this.reivindicar(oc.id, 'fechamento'))) continue;

          try {
            const hora = hhmmNaTz(oc.fimEm, professor.timezone);
            await this.push.enviarPush(oc.professorId, {
              title: `${cadeira.disciplina} · ${cadeira.turma}`,
              body: `A aula terminou às ${hora}. O que você deu?`,
              url: `/aula?id=${oc.id}&momento=fechamento`,
              ocorrenciaId: oc.id,
              tag: `fechamento-${oc.id}`,
              tipo: TipoNotificacao.FECHAMENTO_AULA,
              intensidade: cfg.intensidadeFechamento,
              som: cfg.som,
              vibra: cfg.vibra,
              actions: [{ action: 'registrar', title: 'Registrar' }],
            });
            enviados++;
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            this.logger.error(`Alarme de fechamento falhou para a ocorrência ${oc.id}: ${msg}`);
            void this.erros.registrar(
              'cron:alarmeFechamento',
              'CRON',
              `alarmeFechamento/${oc.id}`,
              oc.professorId,
              msg,
              e instanceof Error ? e.stack : undefined,
            );
          }
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
