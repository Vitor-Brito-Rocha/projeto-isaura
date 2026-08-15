import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SalvarAberturaDto, SalvarFechamentoDto } from './dto/registro.dto';

function data(valor?: string): Date | null | undefined {
  if (valor === undefined) return undefined;
  if (valor === '') return null;
  const d = new Date(`${valor}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

@Injectable()
export class RegistrosService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Tudo que a tela `/aula/[id]` precisa, numa chamada só.
   *
   * Numa sala com sinal ruim, cada ida ao servidor é uma chance de a tela ficar
   * pela metade — por isso a aula, o registro, as unidades do plano e as duas
   * sugestões vêm juntos.
   */
  async contexto(professorId: string, ocorrenciaId: string) {
    const ocorrencia = await this.prisma.ocorrencia.findFirst({
      where: { id: ocorrenciaId, professorId },
      include: {
        cadeira: {
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
        },
        registro: { include: { topicos: true } },
      },
    });
    if (!ocorrencia) throw new NotFoundException('Aula não encontrada.');

    return {
      ocorrencia,
      registro: ocorrencia.registro,
      unidades: ocorrencia.cadeira.plano?.unidades ?? [],
      sugestoes: {
        daAulaAnterior: await this.planoDaAulaAnterior(professorId, ocorrencia),
        daTurmaIrma: await this.conteudoDaTurmaIrma(professorId, ocorrencia),
      },
    };
  }

  /**
   * O `planoProximaAula` que ela escreveu no fechamento da aula anterior desta
   * mesma cadeira.
   *
   * É a peça que transforma o alarme de abertura em confirmação em vez de
   * digitação do zero — e o que torna onze cadeiras sustentáveis.
   */
  private async planoDaAulaAnterior(
    professorId: string,
    ocorrencia: { id: string; cadeiraId: string; inicioEm: Date },
  ) {
    const anterior = await this.prisma.ocorrencia.findFirst({
      where: {
        professorId,
        cadeiraId: ocorrencia.cadeiraId,
        inicioEm: { lt: ocorrencia.inicioEm },
        registro: { planoProximaAula: { not: null } },
      },
      orderBy: { inicioEm: 'desc' },
      select: { data: true, registro: { select: { planoProximaAula: true } } },
    });
    if (!anterior?.registro?.planoProximaAula) return null;
    return { data: anterior.data, texto: anterior.registro.planoProximaAula };
  }

  /**
   * O que ela deu na turma irmã mais recente — outra cadeira que segue o MESMO
   * plano curricular.
   *
   * Turmas irmãs andam com poucos dias de diferença, então na abertura do 8ºB
   * mostrar o que foi dado no 8ºA transforma o formulário em conferência. Só
   * existe porque a unidade agora pendura no plano, e não na cadeira.
   */
  private async conteudoDaTurmaIrma(
    professorId: string,
    ocorrencia: { cadeiraId: string; inicioEm: Date; cadeira: { planoCurricularId: string | null } },
  ) {
    const planoId = ocorrencia.cadeira.planoCurricularId;
    if (!planoId) return null;

    const irma = await this.prisma.ocorrencia.findFirst({
      where: {
        professorId,
        cadeiraId: { not: ocorrencia.cadeiraId },
        cadeira: { planoCurricularId: planoId },
        inicioEm: { lt: ocorrencia.inicioEm },
        registro: { conteudoDado: { not: null } },
      },
      orderBy: { inicioEm: 'desc' },
      select: {
        data: true,
        cadeira: { select: { turma: true } },
        registro: { select: { conteudoDado: true, unidadeId: true } },
      },
    });
    if (!irma?.registro?.conteudoDado) return null;

    return {
      turma: irma.cadeira.turma,
      data: irma.data,
      texto: irma.registro.conteudoDado,
      unidadeId: irma.registro.unidadeId,
    };
  }

  async salvarAbertura(professorId: string, ocorrenciaId: string, dto: SalvarAberturaDto) {
    await this.garantirOcorrencia(professorId, ocorrenciaId);
    return this.prisma.registroAula.upsert({
      where: { ocorrenciaId },
      create: { professorId, ocorrenciaId, planoPrevisto: dto.planoPrevisto },
      update: { planoPrevisto: dto.planoPrevisto },
      include: { topicos: true },
    });
  }

  async salvarFechamento(professorId: string, ocorrenciaId: string, dto: SalvarFechamentoDto) {
    await this.garantirOcorrencia(professorId, ocorrenciaId);
    if (dto.unidadeId) await this.garantirUnidade(professorId, dto.unidadeId);
    if (dto.topicosCobertos?.length) {
      await this.garantirTopicos(professorId, dto.topicosCobertos);
    }

    const campos = {
      conteudoDado: dto.conteudoDado,
      unidadeId: dto.unidadeId,
      atividadeCasa: dto.atividadeCasa,
      dataEntrega: data(dto.dataEntrega),
      planoProximaAula: dto.planoProximaAula,
    };

    // Numa transação: a lista de tópicos é substituída por inteiro, e um
    // fechamento salvo pela metade (texto sim, tópicos não) é pior que nenhum.
    return this.prisma.$transaction(async (tx) => {
      const registro = await tx.registroAula.upsert({
        where: { ocorrenciaId },
        create: { professorId, ocorrenciaId, ...campos },
        update: campos,
      });

      if (dto.topicosCobertos) {
        await tx.registroTopico.deleteMany({ where: { registroId: registro.id } });
        if (dto.topicosCobertos.length) {
          await tx.registroTopico.createMany({
            data: dto.topicosCobertos.map((topicoId) => ({ registroId: registro.id, topicoId })),
            skipDuplicates: true,
          });
        }
      }

      return tx.registroAula.findUniqueOrThrow({
        where: { id: registro.id },
        include: { topicos: true },
      });
    });
  }

  // ---- Guardas ------------------------------------------------------------

  private async garantirOcorrencia(professorId: string, ocorrenciaId: string) {
    const achou = await this.prisma.ocorrencia.findFirst({
      where: { id: ocorrenciaId, professorId },
      select: { id: true },
    });
    if (!achou) throw new NotFoundException('Aula não encontrada.');
  }

  private async garantirUnidade(professorId: string, unidadeId: string) {
    const achou = await this.prisma.unidade.findFirst({
      where: { id: unidadeId, professorId },
      select: { id: true },
    });
    if (!achou) throw new NotFoundException('Unidade não encontrada.');
  }

  /**
   * Confere os tópicos de uma vez só. Sem isto, um id de tópico de outra conta
   * entraria em `registros_topicos` — a tabela não tem `professorId` próprio,
   * então é aqui que a barreira precisa existir.
   */
  private async garantirTopicos(professorId: string, topicoIds: string[]) {
    const quantos = await this.prisma.topico.count({
      where: { id: { in: topicoIds }, unidade: { professorId } },
    });
    if (quantos !== new Set(topicoIds).size) {
      throw new NotFoundException('Algum tópico não foi encontrado.');
    }
  }
}
