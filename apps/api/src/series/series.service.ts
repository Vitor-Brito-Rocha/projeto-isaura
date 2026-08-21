import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Frequencia, StatusOcorrencia } from '@prisma/client';
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
import { AulaExistente, choqueInterno, mensagemDeChoque, primeiroChoque } from './conflito';
import { CreateSerieDto, GradeDoCalendarioDto, HorarioDto, UpdateSerieDto } from './dto/serie.dto';

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

    await this.recusarSeChocar(professorId, {
      frequencia: dto.frequencia,
      dataInicio: dataUTC(dto.dataInicio),
      dataFim: dto.dataFim ? dataUTC(dto.dataFim) : null,
      horarios: dto.horarios,
    });

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

  /**
   * Cria a grade a partir de uma lista de datas, sem `SerieAula`.
   *
   * É o caminho da importação do `Plano de Ensino`: o documento traz o
   * calendário real da turma, com os dias sem aula já fora. Uma série semanal
   * geraria as aulas nesses dias também, e o estrago é o alarme tocando num dia
   * em que ela não tem aula. Ver `GradeDoCalendarioDto` para por que marcar
   * como feriado depois não resolve.
   *
   * O preço é que estas aulas não têm regra de recorrência para editar em
   * bloco — cada uma se cancela e se remarca sozinha, pela tela da aula. É o
   * troco justo: o documento não descreve uma regra, descreve um calendário.
   */
  async criarDoCalendario(professorId: string, dto: GradeDoCalendarioDto) {
    this.validarHorarios(dto.horarios);

    const cadeira = await this.prisma.cadeira.findFirst({
      where: { id: dto.cadeiraId, professorId },
      select: { id: true },
    });
    if (!cadeira) throw new BadRequestException('Cadeira não encontrada.');

    const professor = await this.prisma.professor.findUniqueOrThrow({
      where: { id: professorId },
      select: { timezone: true },
    });

    const aulas = this.casarDatasComHorarios(dto);
    await this.recusarSeChocarComDatas(professorId, aulas);

    const criadas = await this.prisma.ocorrencia.createMany({
      data: aulas.map((a) => ({
        professorId,
        cadeiraId: dto.cadeiraId,
        serieId: null,
        data: dataUTC(a.dataIso),
        horaInicio: a.horaInicio,
        horaFim: a.horaFim,
        inicioEm: instanteDeParede(a.dataIso, a.horaInicio, professor.timezone),
        fimEm: instanteDeParede(a.dataIso, a.horaFim, professor.timezone),
        status: StatusOcorrencia.AGENDADA,
      })),
    });

    // Quem impede a grade dobrada numa importação repetida é a checagem de
    // choque acima, e não o banco: não existe unique em (cadeira, data,
    // horaInicio), então `skipDuplicates` aqui não teria o que pular. A segunda
    // importação bate contra as próprias ocorrências da primeira e é recusada
    // com a mensagem dizendo com qual turma chocou.
    return { criadas: criadas.count, pedidas: aulas.length };
  }

  /**
   * Cada data recebe o horário do SEU dia da semana.
   *
   * Data sem horário correspondente é recusada com a data escrita na mensagem,
   * e não descartada: descartar em silêncio deixaria a grade curta, e ela só
   * descobriria no dia em que a aula não aparecesse.
   */
  private casarDatasComHorarios(dto: GradeDoCalendarioDto) {
    const porDia = new Map(dto.horarios.map((h) => [h.diaSemana, h]));

    return [...new Set(dto.datas)].sort().map((dataIso) => {
      const horario = porDia.get(dataUTC(dataIso).getUTCDay());
      if (!horario) {
        throw new BadRequestException(
          `Nenhum horário para ${dataIso}: a data não cai em nenhum dos dias escolhidos.`,
        );
      }
      return { dataIso, horaInicio: horario.horaInicio, horaFim: horario.horaFim };
    });
  }

  /**
   * Mesma regra do `recusarSeChocar`, sobre datas explícitas.
   *
   * A janela aqui é a do próprio documento e não os 60 dias da materialização:
   * as ocorrências são criadas todas de uma vez, então todas precisam ser
   * conferidas de uma vez.
   */
  private async recusarSeChocarComDatas(
    professorId: string,
    aulas: { dataIso: string; horaInicio: string; horaFim: string }[],
  ) {
    const datas = aulas.map((a) => dataUTC(a.dataIso));
    const ocorrencias = await this.prisma.ocorrencia.findMany({
      where: {
        professorId,
        data: { gte: datas[0], lte: datas[datas.length - 1] },
        status: { not: StatusOcorrencia.CANCELADA },
        // **Turma arquivada não ocupa horário.** `cadeira.ativo` é o que separa
        // "aula que ela vai dar" de "linha que existe no banco". Arquivar já
        // cancela as aulas FUTURAS (`CadeirasService.desativar`), mas as que já
        // passaram continuam AGENDADA de propósito — são histórico e podem ter
        // registro, e mudar o status delas tiraria do progresso o que ela deu.
        //
        // Sem este filtro esse histórico bloqueava a importação de um plano
        // novo no mesmo horário: o calendário do documento começa no início do
        // semestre, então ele cobre justamente as datas onde a turma antiga já
        // tem aula. A única saída era apagar a turma antiga — que leva o
        // histórico inteiro junto, e é exatamente o que `desativar` existe para
        // não fazer.
        cadeira: { ativo: true },
      },
      select: {
        data: true,
        horaInicio: true,
        horaFim: true,
        serieId: true,
        cadeira: { select: { disciplina: true, turma: true } },
      },
    });

    const existentes: AulaExistente[] = ocorrencias.map((o) => ({
      data: o.data,
      horaInicio: o.horaInicio,
      horaFim: o.horaFim,
      serieId: o.serieId,
      cadeira: `${o.cadeira.disciplina} · ${o.cadeira.turma}`,
    }));

    const choque = primeiroChoque(
      aulas.map((a) => ({ data: dataUTC(a.dataIso), horaInicio: a.horaInicio, horaFim: a.horaFim })),
      existentes,
    );
    if (choque) throw new ConflictException(mensagemDeChoque(choque));
  }

  async atualizar(professorId: string, id: string, dto: UpdateSerieDto) {
    const atual = await this.buscar(professorId, id);
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

    if (mudaAsDatas) {
      // A série editada é ignorada de propósito: as ocorrências dela ainda estão
      // no banco, e sem isto toda edição chocaria consigo mesma.
      await this.recusarSeChocar(
        professorId,
        {
          frequencia: dto.frequencia ?? atual.frequencia,
          dataInicio: dto.dataInicio ? dataUTC(dto.dataInicio) : atual.dataInicio,
          dataFim: dto.dataFim ? dataUTC(dto.dataFim) : atual.dataFim,
          horarios: dto.horarios ?? atual.horarios,
        },
        id,
      );
    }

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

  /**
   * Recusa antes de gravar, e diz com o quê chocou.
   *
   * Compara contra as OCORRÊNCIAS já materializadas, e não contra as outras
   * séries, porque só as ocorrências sabem em que dias a regra de fato cai:
   * quinzenal alternando, série que já terminou, feriado cancelado à mão. A
   * recorrência é expandida na mesma janela da materialização — o que estiver
   * além dela ainda não existe para ninguém.
   *
   * Canceladas ficam de fora: aula que ela desmarcou não ocupa mais o horário,
   * e bloquear por causa dela seria o sistema defendendo um compromisso que a
   * própria professora já desfez.
   */
  private async recusarSeChocar(
    professorId: string,
    serie: {
      frequencia: Frequencia;
      dataInicio: Date;
      dataFim: Date | null;
      horarios: HorarioDto[];
    },
    ignorarSerieId?: string,
  ) {
    const de = hojeUTC();
    const ate = somarDias(de, JANELA_DIAS);

    const candidatas = this.recorrencia.gerar({ ...serie, de, ate });
    if (candidatas.length === 0) return;

    const ocorrencias = await this.prisma.ocorrencia.findMany({
      where: {
        professorId,
        data: { gte: de, lte: ate },
        status: { not: StatusOcorrencia.CANCELADA },
        // Mesma regra do `recusarSeChocarComDatas`, e pelo mesmo motivo: turma
        // arquivada é compromisso que ela desfez.
        cadeira: { ativo: true },
        ...(ignorarSerieId ? { serieId: { not: ignorarSerieId } } : {}),
      },
      select: {
        data: true,
        horaInicio: true,
        horaFim: true,
        serieId: true,
        cadeira: { select: { disciplina: true, turma: true } },
      },
    });

    const existentes: AulaExistente[] = ocorrencias.map((o) => ({
      data: o.data,
      horaInicio: o.horaInicio,
      horaFim: o.horaFim,
      serieId: o.serieId,
      cadeira: `${o.cadeira.disciplina} · ${o.cadeira.turma}`,
    }));

    const choque = primeiroChoque(candidatas, existentes);
    if (choque) throw new ConflictException(mensagemDeChoque(choque));
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

    const interno = choqueInterno(horarios);
    if (interno) {
      const [a, b] = interno;
      throw new BadRequestException(
        `Dois horários se sobrepõem no mesmo dia: ${a.horaInicio}–${a.horaFim} e ` +
          `${b.horaInicio}–${b.horaFim}. Uma aula só pode acontecer de cada vez.`,
      );
    }
  }
}
