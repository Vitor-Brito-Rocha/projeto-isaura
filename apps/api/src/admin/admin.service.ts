import { Injectable } from '@nestjs/common';
import { StatusOcorrencia } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const DIA = 86_400_000;

/**
 * Leitura macro, atravessando contas.
 *
 * É o único lugar do sistema que consulta sem `professorId` no `where`, e por
 * isso vive atrás do `AdminGuard` — em todo o resto, uma consulta sem esse
 * filtro é bug de vazamento entre contas. Só leitura: nada aqui escreve.
 */
@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  /** Os números de capa. */
  async resumo() {
    const agora = new Date();
    const ha7 = new Date(agora.getTime() - 7 * DIA);
    const ha30 = new Date(agora.getTime() - 30 * DIA);

    const [
      professores,
      novos30,
      cadeiras,
      aulasTotais,
      aulasPassadas,
      registradas,
      comDevice,
      erros24h,
      erros7d,
      ativos7d,
    ] = await Promise.all([
      this.prisma.professor.count(),
      this.prisma.professor.count({ where: { criadoEm: { gte: ha30 } } }),
      this.prisma.cadeira.count({ where: { ativo: true } }),
      this.prisma.ocorrencia.count(),
      this.contarAulasEfetivas({ lte: agora }),
      this.prisma.registroAula.count({ where: { conteudoDado: { not: null } } }),
      this.prisma.pushSubscription
        .findMany({ distinct: ['professorId'], select: { professorId: true } })
        .then((r) => r.length),
      this.prisma.erroLog.count({ where: { criadoEm: { gte: new Date(agora.getTime() - DIA) } } }),
      this.prisma.erroLog.count({ where: { criadoEm: { gte: ha7 } } }),
      this.prisma.registroAula
        .findMany({
          where: { atualizadoEm: { gte: ha7 } },
          distinct: ['professorId'],
          select: { professorId: true },
        })
        .then((r) => r.length),
    ]);

    return {
      professores: { total: professores, novos30, ativos7d, comDevice },
      aulas: {
        cadeirasAtivas: cadeiras,
        agendadas: aulasTotais,
        jaAconteceram: aulasPassadas,
        registradas,
        // A métrica que importa: aula que passou e virou registro. É a promessa
        // do produto num número só — o resto é volume.
        taxaRegistro: aulasPassadas ? Math.round((registradas / aulasPassadas) * 100) : null,
      },
      erros: { ultimas24h: erros24h, ultimos7d: erros7d },
    };
  }

  /** Uma linha por professor, para a tabela do painel. */
  async professores() {
    const professores = await this.prisma.professor.findMany({
      orderBy: { criadoEm: 'desc' },
      select: {
        id: true,
        nome: true,
        email: true,
        timezone: true,
        criadoEm: true,
        _count: { select: { cadeiras: true, ocorrencias: true, subscriptions: true } },
      },
    });

    // Uma consulta agregada por métrica, e não um laço por professor: com N
    // contas o laço vira N×3 idas ao banco, e o painel degrada sozinho.
    const [porProfessor, ultimoRegistro] = await Promise.all([
      this.prisma.registroAula.groupBy({
        by: ['professorId'],
        where: { conteudoDado: { not: null } },
        _count: { _all: true },
      }),
      this.prisma.registroAula.groupBy({
        by: ['professorId'],
        _max: { atualizadoEm: true },
      }),
    ]);

    const registros = new Map(porProfessor.map((r) => [r.professorId, r._count._all]));
    const ultimo = new Map(ultimoRegistro.map((r) => [r.professorId, r._max.atualizadoEm]));

    return professores.map((p) => ({
      id: p.id,
      nome: p.nome,
      email: p.email,
      timezone: p.timezone,
      criadoEm: p.criadoEm,
      cadeiras: p._count.cadeiras,
      ocorrencias: p._count.ocorrencias,
      devices: p._count.subscriptions,
      registros: registros.get(p.id) ?? 0,
      ultimoRegistroEm: ultimo.get(p.id) ?? null,
    }));
  }

  /**
   * O log de erro, mais recente primeiro.
   *
   * `erros_log` tem RLS ligada e **zero policies**, então nem a chave anônima
   * nem o dono de outra conta enxergam isto — a única porta é esta, atrás do
   * guard. `stack` fica de fora da lista: é o campo que estoura a resposta.
   */
  async erros(pagina: number, tamanho: number, origem?: string) {
    const where = origem ? { origem: { contains: origem } } : {};
    const [total, itens] = await Promise.all([
      this.prisma.erroLog.count({ where }),
      this.prisma.erroLog.findMany({
        where,
        orderBy: { criadoEm: 'desc' },
        skip: (pagina - 1) * tamanho,
        take: tamanho,
        select: {
          id: true,
          criadoEm: true,
          origem: true,
          metodo: true,
          rota: true,
          professorId: true,
          mensagem: true,
        },
      }),
    ]);
    return { total, pagina, tamanho, itens };
  }

  /** O detalhe, com stack — pedido um a um, e não na lista. */
  erro(id: string) {
    return this.prisma.erroLog.findUnique({ where: { id } });
  }

  /** Aulas que já aconteceram e não foram canceladas nem viraram feriado. */
  private contarAulasEfetivas(fimEm: { lte: Date }) {
    return this.prisma.ocorrencia.count({
      where: {
        fimEm,
        status: { notIn: [StatusOcorrencia.CANCELADA, StatusOcorrencia.FERIADO] },
      },
    });
  }
}
