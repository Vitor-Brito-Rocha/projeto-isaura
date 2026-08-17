import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ondeDoRegistro } from '../common/filtro-exportacao';
import { isoDeDataUTC } from '../common/tz';
import { PrismaService } from '../prisma/prisma.service';
import { ConsultaHistoricoDto } from './dto/historico.dto';

export interface LinhaDoHistorico {
  registroId: string;
  ocorrenciaId: string;
  data: string;
  horaInicio: string;
  horaFim: string;
  cadeira: { id: string; disciplina: string; turma: string; corHex: string };
  unidade: string | null;
  topicos: string[];
  planoPrevisto: string | null;
  conteudoDado: string | null;
  atividadeCasa: string | null;
  dataEntrega: string | null;
  planoProximaAula: string | null;
  anexos: number;
}

/** Teto por página. A tela de relatório pede tudo de uma vez para imprimir. */
const MAXIMO = 500;

/**
 * O histórico do que foi dado — a linha do tempo, a busca e o que alimenta a
 * exportação.
 *
 * **A fala dela e o rascunho da IA não saem daqui. Nunca.** Não é omissão na
 * tela: o `select` abaixo não busca `transcricaoBruta` nem `resumoPadronizado`,
 * e essa é a razão de a exportação e a busca compartilharem este serviço em vez
 * de cada uma montar a própria consulta. A exportação é o artefato que sai da
 * mão dela — para a coordenação, para o e-mail, para o Drive — e a fala pode ter
 * nome de aluno. O registro revisado é o documento; a fala é dela e só dela.
 *
 * Ver "LGPD" em docs/PLANO.md.
 */
@Injectable()
export class HistoricoService {
  private readonly logger = new Logger(HistoricoService.name);

  constructor(private readonly prisma: PrismaService) {}

  async listar(professorId: string, consulta: ConsultaHistoricoDto) {
    const pagina = Math.max(1, consulta.pagina ?? 1);
    const tamanho = Math.min(MAXIMO, Math.max(1, consulta.tamanho ?? 30));

    const termo = consulta.busca?.trim();
    const where = {
      ...this.montarFiltro(professorId, consulta),
      ...(termo ? { id: { in: await this.idsQueCasam(professorId, termo) } } : {}),
    };

    const [total, registros] = await Promise.all([
      this.prisma.registroAula.count({ where }),
      this.prisma.registroAula.findMany({
        where,
        // Mais recente primeiro: a pergunta usual é "o que eu dei nas últimas
        // aulas", não "o que eu dei em fevereiro".
        orderBy: { ocorrencia: { data: 'desc' } },
        skip: (pagina - 1) * tamanho,
        take: tamanho,
        select: {
          id: true,
          planoPrevisto: true,
          conteudoDado: true,
          atividadeCasa: true,
          dataEntrega: true,
          planoProximaAula: true,
          // `transcricaoBruta` e `resumoPadronizado` NÃO entram. Ver o
          // comentário da classe — é aqui que a regra vive.
          unidade: { select: { titulo: true } },
          topicos: { select: { topico: { select: { titulo: true, ordem: true } } } },
          _count: { select: { anexos: true } },
          ocorrencia: {
            select: {
              id: true,
              data: true,
              horaInicio: true,
              horaFim: true,
              cadeira: { select: { id: true, disciplina: true, turma: true, corHex: true } },
            },
          },
        },
      }),
    ]);

    const itens: LinhaDoHistorico[] = registros.map((r) => ({
      registroId: r.id,
      ocorrenciaId: r.ocorrencia.id,
      data: isoDeDataUTC(r.ocorrencia.data),
      horaInicio: r.ocorrencia.horaInicio,
      horaFim: r.ocorrencia.horaFim,
      cadeira: r.ocorrencia.cadeira,
      unidade: r.unidade?.titulo ?? null,
      topicos: [...r.topicos]
        .sort((a, b) => a.topico.ordem - b.topico.ordem)
        .map((t) => t.topico.titulo),
      planoPrevisto: r.planoPrevisto,
      conteudoDado: r.conteudoDado,
      atividadeCasa: r.atividadeCasa,
      dataEntrega: r.dataEntrega ? isoDeDataUTC(r.dataEntrega) : null,
      planoProximaAula: r.planoProximaAula,
      anexos: r._count.anexos,
    }));

    return { total, pagina, tamanho, itens };
  }

  /**
   * Os registros que casam com o termo, ignorando acento **e** caixa.
   *
   * Medido antes de escrever: com o `contains` do Prisma, `frações` achava 14
   * registros e `fracoes` achava **zero**. Ela digita no celular, com pressa,
   * entre uma aula e outra — busca que exige o acento certo é busca que não
   * funciona.
   *
   * Consulta crua porque `unaccent()` não tem como ser expresso no Prisma, e só
   * para colher ids: o `findMany` com todos os `include` continua sendo Prisma.
   * O template literal parametriza — o termo nunca é concatenado no SQL.
   *
   * **Só estes quatro campos.** `transcricaoBruta` fica de fora de propósito:
   * busca é o jeito mais fácil de transformar um campo privado em índice
   * consultável.
   */
  private async idsQueCasam(professorId: string, termo: string): Promise<string[]> {
    const alvo = `%${termo}%`;
    try {
      const linhas = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM registros_aula
        WHERE professor_id = ${professorId}
          AND revisado_em IS NOT NULL
          AND (
            unaccent(coalesce(conteudo_dado, '')) ILIKE unaccent(${alvo})
            OR unaccent(coalesce(plano_previsto, '')) ILIKE unaccent(${alvo})
            OR unaccent(coalesce(atividade_casa, '')) ILIKE unaccent(${alvo})
            OR unaccent(coalesce(plano_proxima_aula, '')) ILIKE unaccent(${alvo})
          )
      `;
      return linhas.map((l) => l.id);
    } catch (e) {
      // Sem a extensão instalada (`prisma:rls` ainda não rodou), a busca cai
      // para o casamento com acento em vez de devolver 500. Pior busca é melhor
      // que tela de erro — e o log diz o que fazer.
      this.logger.warn(
        `Busca sem unaccent (rode prisma:rls): ${e instanceof Error ? e.message : e}`,
      );
      const cru = await this.prisma.registroAula.findMany({
        where: {
          professorId,
          revisadoEm: { not: null },
          OR: [
            { conteudoDado: { contains: termo, mode: 'insensitive' } },
            { planoPrevisto: { contains: termo, mode: 'insensitive' } },
            { atividadeCasa: { contains: termo, mode: 'insensitive' } },
            { planoProximaAula: { contains: termo, mode: 'insensitive' } },
          ],
        },
        select: { id: true },
      });
      return cru.map((r) => r.id);
    }
  }

  /**
   * O recorte mora em `common/filtro-exportacao.ts`, testado sem banco.
   *
   * Saiu daqui porque as pendências precisam exatamente do mesmo — e duas
   * cópias do filtro é como uma delas passa a mandar o que a outra barra.
   */
  private montarFiltro(
    professorId: string,
    consulta: ConsultaHistoricoDto,
  ): Prisma.RegistroAulaWhereInput {
    return ondeDoRegistro(professorId, consulta);
  }
}
