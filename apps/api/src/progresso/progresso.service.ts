import { Injectable, NotFoundException } from '@nestjs/common';
import { StatusOcorrencia } from '@prisma/client';
import { hojeUTC, isoDeDataUTC } from '../common/tz';
import { PrismaService } from '../prisma/prisma.service';
import {
  calcularRitmo,
  percentual,
  progressoDasUnidades,
  unidadeAtual,
  type ProgressoUnidade,
  type Ritmo,
  type UnidadeDoPlano,
} from './calcular';

export interface ResumoDaCadeira {
  cadeiraId: string;
  disciplina: string;
  turma: string;
  corHex: string;
  anoLetivo: number;
  semestre: number | null;
  plano: { id: string; nome: string } | null;
  total: number;
  cobertos: number;
  percentual: number | null;
  unidadeAtual: { id: string; titulo: string; cobertos: number; total: number } | null;
  aulasRegistradas: number;
  ultimaAulaEm: string | null;
  ritmo: Ritmo | null;
  /** Turmas que seguem o mesmo plano — a comparação que 11 turmas exigem. */
  irmas: { cadeiraId: string; turma: string }[];
}

@Injectable()
export class ProgressoService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Uma linha por cadeira ativa.
   *
   * Três consultas no total, e não três por cadeira: com onze cadeiras, o laço
   * ingênuo seria trinta e três idas ao banco para desenhar uma tela. O
   * agrupamento acontece em memória, onde o volume de uma professora cabe
   * folgado — algo como 500 registros por ano.
   */
  async resumo(professorId: string): Promise<ResumoDaCadeira[]> {
    const cadeiras = await this.prisma.cadeira.findMany({
      where: { professorId, ativo: true },
      orderBy: [{ disciplina: 'asc' }, { turma: 'asc' }],
      include: {
        plano: {
          include: {
            unidades: {
              orderBy: { ordem: 'asc' },
              include: { topicos: { orderBy: { ordem: 'asc' } } },
            },
          },
        },
      },
    });
    if (cadeiras.length === 0) return [];

    const [porCadeira, futurasPorCadeira] = await Promise.all([
      this.registrosPorCadeira(professorId),
      this.aulasFuturasPorCadeira(professorId),
    ]);

    // Turmas irmãs: mesmo plano, cadeiras diferentes. Sai daqui de graça
    // porque a lista já está carregada.
    const porPlano = new Map<string, { cadeiraId: string; turma: string }[]>();
    for (const c of cadeiras) {
      if (!c.planoCurricularId) continue;
      const lista = porPlano.get(c.planoCurricularId) ?? [];
      lista.push({ cadeiraId: c.id, turma: c.turma });
      porPlano.set(c.planoCurricularId, lista);
    }

    return cadeiras.map((c) => {
      const dados = porCadeira.get(c.id) ?? { topicos: new Set<string>(), aulas: [] as string[] };
      const unidades = progressoDasUnidades(paraPlano(c.plano?.unidades ?? []), dados.topicos);
      const atual = unidadeAtual(unidades);

      const total = unidades.reduce((s, u) => s + u.total, 0);
      const cobertos = unidades.reduce((s, u) => s + u.cobertos, 0);

      return {
        cadeiraId: c.id,
        disciplina: c.disciplina,
        turma: c.turma,
        corHex: c.corHex,
        anoLetivo: c.anoLetivo,
        semestre: c.semestre,
        plano: c.plano ? { id: c.plano.id, nome: c.plano.nome } : null,
        total,
        cobertos,
        percentual: percentual(cobertos, total),
        unidadeAtual: atual
          ? { id: atual.id, titulo: atual.titulo, cobertos: atual.cobertos, total: atual.total }
          : null,
        aulasRegistradas: dados.aulas.length,
        // As datas já vêm ordenadas da consulta; a última é a mais recente.
        ultimaAulaEm: dados.aulas.at(-1) ?? null,
        ritmo: calcularRitmo(atual, futurasPorCadeira.get(c.id) ?? []),
        irmas: (porPlano.get(c.planoCurricularId ?? '') ?? []).filter((i) => i.cadeiraId !== c.id),
      };
    });
  }

  /** Unidade a unidade, com os tópicos que ainda faltam. */
  async daCadeira(
    professorId: string,
    cadeiraId: string,
  ): Promise<{ resumo: ResumoDaCadeira; unidades: ProgressoUnidade[] }> {
    const cadeira = await this.prisma.cadeira.findFirst({
      where: { id: cadeiraId, professorId },
      include: {
        plano: {
          include: {
            unidades: {
              orderBy: { ordem: 'asc' },
              include: { topicos: { orderBy: { ordem: 'asc' } } },
            },
          },
        },
      },
    });
    if (!cadeira) throw new NotFoundException('Cadeira não encontrada.');

    const todas = await this.resumo(professorId);
    const resumo = todas.find((r) => r.cadeiraId === cadeiraId);
    // Cadeira inativa não entra no resumo, mas continua consultável: o
    // histórico dela é justamente o que a coordenação pede depois.
    if (!resumo) throw new NotFoundException('Cadeira sem progresso a mostrar.');

    const dados = await this.registrosPorCadeira(professorId);
    const cobertos = dados.get(cadeiraId)?.topicos ?? new Set<string>();

    return { resumo, unidades: progressoDasUnidades(paraPlano(cadeira.plano?.unidades ?? []), cobertos) };
  }

  /**
   * Tópicos cobertos e datas registradas, por cadeira.
   *
   * `revisadoEm: { not: null }` é a regra do produto inteira numa cláusula:
   * rascunho de IA que ela não conferiu não conta como aula dada, e portanto
   * não empurra a barra de progresso.
   */
  private async registrosPorCadeira(professorId: string) {
    const registros = await this.prisma.registroAula.findMany({
      where: { professorId, revisadoEm: { not: null } },
      orderBy: { ocorrencia: { data: 'asc' } },
      select: {
        topicos: { select: { topicoId: true } },
        ocorrencia: { select: { cadeiraId: true, data: true } },
      },
    });

    const mapa = new Map<string, { topicos: Set<string>; aulas: string[] }>();
    for (const r of registros) {
      const chave = r.ocorrencia.cadeiraId;
      const atual = mapa.get(chave) ?? { topicos: new Set<string>(), aulas: [] };
      // Set: o mesmo tópico revisitado em três aulas conta uma vez. Ela volta
      // ao assunto quando a turma não pegou, e isso é ensino, não progresso.
      for (const t of r.topicos) atual.topicos.add(t.topicoId);
      atual.aulas.push(isoDeDataUTC(r.ocorrencia.data));
      mapa.set(chave, atual);
    }
    return mapa;
  }

  /** As aulas que ainda vão acontecer — o denominador do ritmo. */
  private async aulasFuturasPorCadeira(professorId: string) {
    const futuras = await this.prisma.ocorrencia.findMany({
      where: {
        professorId,
        data: { gte: hojeUTC() },
        // Cancelada e feriado não são aula para dar conteúdo: contá-las
        // prometeria um prazo que não existe.
        status: { notIn: [StatusOcorrencia.CANCELADA, StatusOcorrencia.FERIADO] },
      },
      select: { cadeiraId: true, data: true },
      orderBy: { data: 'asc' },
    });

    const mapa = new Map<string, string[]>();
    for (const o of futuras) {
      const lista = mapa.get(o.cadeiraId) ?? [];
      lista.push(isoDeDataUTC(o.data));
      mapa.set(o.cadeiraId, lista);
    }
    return mapa;
  }
}

/** Prisma devolve `Date` nas colunas `@db.Date`; o cálculo compara "YYYY-MM-DD". */
function paraPlano(
  unidades: {
    id: string;
    ordem: number;
    titulo: string;
    dataFimPrevista: Date | null;
    topicos: { id: string; titulo: string }[];
  }[],
): UnidadeDoPlano[] {
  return unidades.map((u) => ({
    id: u.id,
    ordem: u.ordem,
    titulo: u.titulo,
    dataFimPrevista: u.dataFimPrevista ? isoDeDataUTC(u.dataFimPrevista) : null,
    topicos: u.topicos.map((t) => ({ id: t.id, titulo: t.titulo })),
  }));
}
