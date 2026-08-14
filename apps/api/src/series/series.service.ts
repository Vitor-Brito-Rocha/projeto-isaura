import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { StatusOcorrencia } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JANELA_DIAS, RecorrenciaService } from '../agenda/recorrencia.service';
import {
  dataUTC,
  hojeUTC,
  instanteDeParede,
  isoDeDataUTC,
  minutos,
  somarDias,
} from '../common/tz';
import { CreateSerieDto, HorarioDto, UpdateSerieDto } from './dto/serie.dto';

@Injectable()
export class SeriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly recorrencia: RecorrenciaService,
  ) {}

  listar(professorId: string, cadeiraId?: string) {
    return this.prisma.serieAula.findMany({
      where: { professorId, ...(cadeiraId ? { cadeiraId } : {}) },
      orderBy: { criadoEm: 'desc' },
      include: {
        horarios: { orderBy: [{ diaSemana: 'asc' }, { horaInicio: 'asc' }] },
        cadeira: { select: { id: true, disciplina: true, turma: true, corHex: true } },
      },
    });
  }

  async buscar(professorId: string, id: string) {
    const serie = await this.prisma.serieAula.findFirst({
      where: { id, professorId },
      include: {
        horarios: { orderBy: [{ diaSemana: 'asc' }, { horaInicio: 'asc' }] },
        cadeira: { select: { id: true, disciplina: true, turma: true, corHex: true } },
      },
    });
    if (!serie) throw new NotFoundException('Série não encontrada.');
    return serie;
  }

  async criar(professorId: string, dto: CreateSerieDto) {
    this.validarHorarios(dto.horarios);

    const cadeira = await this.prisma.cadeira.findFirst({
      where: { id: dto.cadeiraId, professorId },
      select: { id: true },
    });
    if (!cadeira) throw new BadRequestException('Cadeira não encontrada.');

    const serie = await this.prisma.serieAula.create({
      data: {
        professorId,
        cadeiraId: dto.cadeiraId,
        frequencia: dto.frequencia,
        dataInicio: dataUTC(dto.dataInicio),
        dataFim: dto.dataFim ? dataUTC(dto.dataFim) : null,
        horarios: { create: dto.horarios },
      },
    });

    // Materializa na hora: sem isto a grade fica vazia até o cron das 3h, e a
    // professora que acabou de cadastrar acha que não funcionou.
    await this.materializarFaltantes(serie.id);
    return this.buscar(professorId, serie.id);
  }

  async atualizar(professorId: string, id: string, dto: UpdateSerieDto) {
    await this.buscar(professorId, id);
    if (dto.horarios) this.validarHorarios(dto.horarios);

    // Qualquer um destes muda QUAIS datas a série gera, não só o horário delas.
    // Trocar só os horários e esquecer o resto deixaria a grade desatualizada
    // depois de "adiei o início para agosto" — a professora veria as aulas
    // antigas continuarem lá.
    const mudaAsDatas =
      dto.horarios !== undefined ||
      dto.frequencia !== undefined ||
      dto.dataInicio !== undefined ||
      dto.dataFim !== undefined;

    await this.prisma.$transaction(async (tx) => {
      await tx.serieAula.update({
        where: { id },
        data: {
          frequencia: dto.frequencia,
          dataInicio: dto.dataInicio ? dataUTC(dto.dataInicio) : undefined,
          dataFim: dto.dataFim ? dataUTC(dto.dataFim) : undefined,
          ativo: dto.ativo,
        },
      });

      if (dto.horarios) {
        await tx.serieHorario.deleteMany({ where: { serieId: id } });
        await tx.serieHorario.createMany({
          data: dto.horarios.map((h) => ({ ...h, serieId: id })),
        });
      }

      if (mudaAsDatas) {
        // Apaga as futuras ainda AGENDADAS para materializarFaltantes recriá-las
        // com a configuração nova. As passadas e as já DADAS ficam: são
        // histórico, e reescrevê-las apagaria o registro de aula que de fato
        // aconteceu — junto com o RegistroAula pendurado nela (cascade).
        await tx.ocorrencia.deleteMany({
          where: { serieId: id, status: StatusOcorrencia.AGENDADA, data: { gte: hojeUTC() } },
        });
      }
    });

    if (mudaAsDatas) await this.materializarFaltantes(id);
    return this.buscar(professorId, id);
  }

  async remover(professorId: string, id: string) {
    await this.buscar(professorId, id);
    await this.prisma.$transaction([
      this.prisma.ocorrencia.deleteMany({
        where: { serieId: id, status: StatusOcorrencia.AGENDADA, data: { gte: hojeUTC() } },
      }),
      this.prisma.serieAula.delete({ where: { id } }),
    ]);
    return { ok: true };
  }

  /**
   * Materializa as ocorrências faltantes de uma série na janela padrão.
   *
   * Idempotente de propósito: o cron noturno chama isto para todas as séries
   * ativas todo dia, e criar duplicata a cada execução seria pior do que não
   * gerar nada. A checagem é por (data, horaInicio) contra o que já existe.
   *
   * É aqui que a hora de parede vira instante absoluto, usando a timezone do
   * professor dono da série.
   */
  async materializarFaltantes(serieId: string): Promise<number> {
    const serie = await this.prisma.serieAula.findUnique({
      where: { id: serieId },
      include: {
        horarios: true,
        professor: { select: { timezone: true } },
      },
    });
    if (!serie || !serie.ativo) return 0;

    const de = hojeUTC();
    const ate = somarDias(de, JANELA_DIAS);

    const candidatos = this.recorrencia.gerar({
      frequencia: serie.frequencia,
      dataInicio: serie.dataInicio,
      dataFim: serie.dataFim,
      horarios: serie.horarios,
      de,
      ate,
    });
    if (candidatos.length === 0) return 0;

    const existentes = await this.prisma.ocorrencia.findMany({
      where: { serieId, data: { gte: de, lte: ate } },
      select: { data: true, horaInicio: true },
    });
    const chave = (c: { data: Date; horaInicio: string }) =>
      `${isoDeDataUTC(c.data)}|${c.horaInicio}`;
    const jaTem = new Set(existentes.map(chave));

    const faltantes = candidatos.filter((c) => !jaTem.has(chave(c)));
    if (faltantes.length === 0) return 0;

    const tz = serie.professor.timezone;
    await this.prisma.ocorrencia.createMany({
      data: faltantes.map((c) => {
        const dataIso = isoDeDataUTC(c.data);
        return {
          professorId: serie.professorId,
          cadeiraId: serie.cadeiraId,
          serieId: serie.id,
          data: c.data,
          horaInicio: c.horaInicio,
          horaFim: c.horaFim,
          inicioEm: instanteDeParede(dataIso, c.horaInicio, tz),
          fimEm: instanteDeParede(dataIso, c.horaFim, tz),
          status: StatusOcorrencia.AGENDADA,
        };
      }),
    });
    return faltantes.length;
  }

  private validarHorarios(horarios: HorarioDto[]) {
    for (const h of horarios) {
      if (minutos(h.horaFim) <= minutos(h.horaInicio)) {
        throw new BadRequestException(
          `Horário inválido (${h.horaInicio}–${h.horaFim}): o fim precisa ser depois do início.`,
        );
      }
    }
    // Duplicata de (dia, horaInicio) geraria duas ocorrências idênticas, e o
    // deduplicador de materializarFaltantes trata as duas como a mesma chave —
    // uma sumiria silenciosamente. Melhor recusar aqui, com mensagem clara.
    const vistos = new Set<string>();
    for (const h of horarios) {
      const chave = `${h.diaSemana}|${h.horaInicio}`;
      if (vistos.has(chave)) {
        throw new BadRequestException(`Horário repetido: dia ${h.diaSemana} às ${h.horaInicio}.`);
      }
      vistos.add(chave);
    }
  }
}
