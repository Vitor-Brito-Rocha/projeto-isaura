import { Injectable, NotFoundException } from '@nestjs/common';
import { StatusOcorrencia } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
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
    await this.buscar(professorId, id);

    const cancelada =
      dto.status === StatusOcorrencia.CANCELADA || dto.status === StatusOcorrencia.FERIADO;

    return this.prisma.ocorrencia.update({
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
      },
    });
  }
}
