import { Injectable, NotFoundException } from '@nestjs/common';
import { StatusOcorrencia } from '@prisma/client';
import { AnexosService } from '../anexos/anexos.service';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly anexos: AnexosService,
  ) {}

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
      proximasAulas: await this.proximasAulas(professorId, ocorrencia),
      sugestoes: {
        daAulaAnterior: await this.planoDaAulaAnterior(professorId, ocorrencia),
        daTurmaIrma: await this.conteudoDaTurmaIrma(professorId, ocorrencia),
      },
    };
  }

  /**
   * As próximas aulas desta mesma turma.
   *
   * Tarefa de casa quase nunca vence numa data solta: vence "na próxima aula"
   * ou "na outra". Escolher `qui, 20/08` é um toque; achar 20/08 no seletor de
   * data do celular é rolagem de mês e chance de errar o dia da semana — que é
   * o erro que faz a turma inteira entregar na aula errada.
   *
   * Cancelada e feriado ficam de fora: não dá para receber tarefa em aula que
   * não vai existir.
   */
  private async proximasAulas(
    professorId: string,
    ocorrencia: { cadeiraId: string; inicioEm: Date },
  ) {
    const proximas = await this.prisma.ocorrencia.findMany({
      where: {
        professorId,
        cadeiraId: ocorrencia.cadeiraId,
        inicioEm: { gt: ocorrencia.inicioEm },
        status: { notIn: [StatusOcorrencia.CANCELADA, StatusOcorrencia.FERIADO] },
      },
      orderBy: { inicioEm: 'asc' },
      take: 4,
      select: { id: true, data: true, horaInicio: true, registro: { select: { planoPrevisto: true } } },
    });

    // `temPlano` é o que permite a tela avisar ANTES de cancelar que a
    // transferência vai substituir um plano já escrito. Só o booleano: o texto
    // do plano de outra aula não tem o que fazer nesta tela.
    return proximas.map(({ registro, ...oc }) => ({
      ...oc,
      temPlano: Boolean(registro?.planoPrevisto?.trim()),
    }));
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

      // Ela leu o formulário e salvou: isto deixa de ser rascunho de modelo e
      // passa a contar como registro. É o outro lado da regra "saída da IA é
      // sempre rascunho" — sem alguém marcando o fim, `revisadoEm` nulo diria
      // que nem o que ela digitou à mão conta.
      revisadoEm: new Date(),

      // `transcricaoBruta` e `resumoPadronizado` NÃO são apagados aqui.
      // Decisão do usuário (15/08/2026), revendo o PLANO: ela pode querer
      // reconferir o que falou e o que a IA entendeu meses depois, quando a
      // dúvida sobre um registro aparecer. O áudio continua sendo descartado —
      // ver `descartarAudios`, e a nota de LGPD em docs/PLANO.md.
    };

    // Numa transação: a lista de tópicos é substituída por inteiro, e um
    // fechamento salvo pela metade (texto sim, tópicos não) é pior que nenhum.
    const registro = await this.prisma.$transaction(async (tx) => {
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

      // A aula passa a constar como DADA. `StatusOcorrencia.DADA` existia no
      // enum desde a fase 1 e ninguém escrevia — a tela deduzia o estado de
      // `conteudoDado`, e o banco ficava dizendo AGENDADA para aula já dada.
      //
      // `AGENDADA` no where, e não um update solto: cancelar a aula e depois
      // salvar um texto nela não pode ressuscitá-la em silêncio. Quem desfaz
      // cancelamento é ela, na tela, de propósito.
      await tx.ocorrencia.updateMany({
        where: { id: ocorrenciaId, status: StatusOcorrencia.AGENDADA },
        data: { status: StatusOcorrencia.DADA },
      });

      return tx.registroAula.findUniqueOrThrow({
        where: { id: registro.id },
        include: { topicos: true },
      });
    });

    // Fora da transação de propósito: apagar objeto no Storage é chamada de
    // rede, e segurar a transação por ela é o caminho para lock em tabela
    // quente. Se falhar, o registro já está salvo e o áudio sai na próxima.
    await this.anexos.descartarAudios(professorId, registro.id);

    return registro;
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
