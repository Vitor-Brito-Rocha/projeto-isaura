import { Injectable, NotFoundException } from '@nestjs/common';
import { StatusOcorrencia } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { cadeiraDoFiltro, ondeDaOcorrencia } from '../common/filtro-exportacao';
import { FiltroExportacaoDto } from '../common/filtro-exportacao.dto';
import { dataUTC } from '../common/tz';
import { UpdateOcorrenciaDto } from './dto/ocorrencia.dto';

@Injectable()
export class AgendaService {
  constructor(private readonly prisma: PrismaService) {}

  /** Ocorrências num intervalo de datas — a grade que ela vê na tela. */
  listar(professorId: string, deIso: string, ateIso: string, cadeiraId?: string) {
    return this.prisma.ocorrencia.findMany({
      where: {
        professorId,
        data: { gte: dataUTC(deIso), lte: dataUTC(ateIso) },
        ...(cadeiraId ? { cadeiraId } : {}),
      },
      orderBy: [{ data: 'asc' }, { horaInicio: 'asc' }],
      include: {
        cadeira: { select: { id: true, disciplina: true, turma: true, corHex: true } },
        registro: {
          select: {
            id: true,
            planoPrevisto: true,
            conteudoDado: true,
            revisadoEm: true,
          },
        },
      },
    });
  }

  /**
   * Aulas que já terminaram e continuam sem conteúdo escrito.
   *
   * O alarme é um empurrão, não a única porta. Numa escola, não conseguir
   * escrever na hora é o caso comum e não a exceção: sinal ruim, aula emendada,
   * aluno esperando na porta. Gravar já era possível a qualquer momento — o que
   * faltava era ela **achar** a aula depois sem lembrar a data e caçar semana a
   * semana na grade.
   *
   * Filtra por `fimEm`, e não por `data`: é instante absoluto, então a conta de
   * "já terminou" acerta para professor em qualquer fuso.
   */
  pendencias(professorId: string, dias: number, filtro: FiltroExportacaoDto = {}, limite = 60) {
    const agora = new Date();
    // O mesmo recorte do histórico, para "o que eu dei" e "o que falta" nunca
    // responderem sobre conjuntos diferentes.
    const { data: _ignorado, cadeira: _daCadeira, ...recorte } = ondeDaOcorrencia(filtro);

    return this.prisma.ocorrencia.findMany({
      where: {
        professorId,
        ...recorte,
        /**
         * `fimEm` e não `data`: é instante absoluto, então "já terminou" acerta
         * em qualquer fuso. Quando ela dá um intervalo explícito, ele manda —
         * é o caso do bimestre fechado que vai para a coordenação; sem ele,
         * vale a janela de `dias`, que é o padrão da tela.
         */
        fimEm: {
          lte: filtro.ate ? new Date(`${filtro.ate}T23:59:59.999Z`) : agora,
          gte: filtro.de
            ? new Date(`${filtro.de}T00:00:00.000Z`)
            : new Date(agora.getTime() - dias * 86_400_000),
        },
        // Aula cancelada e feriado não são pendência — não houve o que dar.
        status: { notIn: [StatusOcorrencia.CANCELADA, StatusOcorrencia.FERIADO] },
        /**
         * Turma arquivada também não é pendência.
         *
         * Ela arquivou a turma para tirá-la do caminho; continuar cobrando "12
         * aulas de Cálculo I sem registro" pelo resto do ano é a mesma promessa
         * quebrada do alarme que continuava tocando. O que já ESTÁ registrado
         * continua no histórico e na exportação — `ondeDaOcorrencia` não filtra
         * por `ativo`, e não pode: o relatório do semestre passado é justamente
         * o de turmas que já acabaram.
         *
         * Mesclado, e nunca espalhado por cima: o recorte que ela escolheu
         * (disciplina, ano, semestre) também mora na chave `cadeira`, e em dois
         * espalhamentos o segundo apaga o primeiro em silêncio.
         */
        cadeira: { ...cadeiraDoFiltro(filtro), ativo: true },
        OR: [
          { registro: { is: null } },
          { registro: { conteudoDado: null } },
          { registro: { conteudoDado: '' } },
        ],
      },
      // Mais recente primeiro: é a que ela ainda lembra.
      orderBy: { inicioEm: 'desc' },
      take: limite,
      include: {
        cadeira: { select: { id: true, disciplina: true, turma: true, corHex: true } },
        registro: { select: { id: true, planoPrevisto: true, conteudoDado: true } },
      },
    });
  }

  async buscar(professorId: string, id: string) {
    const ocorrencia = await this.prisma.ocorrencia.findFirst({
      where: { id, professorId },
      include: {
        cadeira: { select: { id: true, disciplina: true, turma: true, corHex: true } },
        registro: { include: { topicos: true, anexos: true } },
      },
    });
    if (!ocorrencia) throw new NotFoundException('Aula não encontrada.');
    return ocorrencia;
  }

  /**
   * Edita uma ocorrência isolada sem mexer na série.
   *
   * Uma agenda escolar tem mais exceção do que regra — feriado, semana de prova,
   * aula trocada com outro professor. Se editar uma aula exigisse alterar a
   * série, a professora teria de desfazer a exceção depois.
   */
  async atualizar(professorId: string, id: string, dto: UpdateOcorrenciaDto) {
    const atual = await this.buscar(professorId, id);

    const cancelada =
      dto.status === StatusOcorrencia.CANCELADA || dto.status === StatusOcorrencia.FERIADO;
    // Reagendar uma aula cancelada precisa DEVOLVER os alarmes. Sem este ramo,
    // marcar feriado por engano e desfazer deixaria a aula na grade com os dois
    // alarmes permanentemente silenciados — o pior tipo de bug aqui, porque a
    // tela mostra tudo certo e só o alarme não vem.
    const reativada = dto.status === StatusOcorrencia.AGENDADA;

    const ocorrencia = await this.prisma.ocorrencia.update({
      where: { id },
      data: {
        status: dto.status,
        observacao: dto.observacao,
        // Cancelar a aula tem de cancelar os alarmes dela. Marcar as duas datas
        // de notificação faz o cron pular a linha — é mais simples e mais
        // robusto do que adicionar `status` a cada where do varredor.
        ...(cancelada
          ? { aberturaNotificadaEm: new Date(), fechamentoNotificadoEm: new Date() }
          : {}),
        ...(reativada ? { aberturaNotificadaEm: null, fechamentoNotificadoEm: null } : {}),
      },
    });

    const transferencia =
      cancelada && dto.transferirPlano
        ? await this.passarPlanoAdiante(professorId, atual)
        : null;

    return { ...ocorrencia, transferencia };
  }

  /**
   * Leva o plano da aula cancelada para a próxima da mesma turma.
   *
   * A aula caiu; o conteúdo não. Se ela planejou "soma de frações" para terça e
   * a terça virou reunião, quinta é onde isso vai acontecer — e reescrever à
   * mão o que já estava escrito é o retrabalho que torna onze cadeiras
   * insustentáveis.
   *
   * **Não apaga o plano da aula cancelada.** Ele fica como registro do que
   * estava previsto: a aula não aconteceu, mas o planejamento existiu, e é isso
   * que ela mostra se perguntarem por que a turma atrasou.
   *
   * Devolve o que conseguiu fazer, com o motivo quando não deu — a tela precisa
   * dizer a verdade sobre o que aconteceu, e "a próxima aula" nem sempre existe.
   */
  private async passarPlanoAdiante(
    professorId: string,
    cancelada: { id: string; cadeiraId: string; data: Date; registro: { planoPrevisto: string | null } | null },
  ) {
    const plano = cancelada.registro?.planoPrevisto?.trim();
    if (!plano) return { ok: false as const, motivo: 'sem-plano' as const };

    const proxima = await this.prisma.ocorrencia.findFirst({
      where: {
        professorId,
        cadeiraId: cancelada.cadeiraId,
        data: { gt: cancelada.data },
        // Não adianta empurrar para outra aula que também não vai acontecer.
        status: { notIn: [StatusOcorrencia.CANCELADA, StatusOcorrencia.FERIADO] },
      },
      orderBy: [{ data: 'asc' }, { horaInicio: 'asc' }],
      select: { id: true, data: true, registro: { select: { planoPrevisto: true } } },
    });
    if (!proxima) return { ok: false as const, motivo: 'sem-proxima' as const };

    // Chegou aqui com plano na próxima significa que a tela avisou e ela
    // confirmou mesmo assim — a decisão é dela, e o aviso é o que a torna
    // informada. Sobrescrever em silêncio é que seria inaceitável.
    const substituiu = Boolean(proxima.registro?.planoPrevisto?.trim());

    await this.prisma.registroAula.upsert({
      where: { ocorrenciaId: proxima.id },
      create: { professorId, ocorrenciaId: proxima.id, planoPrevisto: plano },
      update: { planoPrevisto: plano },
    });

    return { ok: true as const, ocorrenciaId: proxima.id, data: proxima.data, substituiu };
  }
}
