import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { StatusOcorrencia } from '@prisma/client';
import { resolverAlarme } from '../alarmes/resolver-alarme';
import { PrismaService } from '../prisma/prisma.service';
import { proximaCor } from './cores';
import { CreateCadeiraDto, UpdateCadeiraDto } from './dto/cadeira.dto';
import { UpsertConfigAlarmeDto } from './dto/config-alarme.dto';

/**
 * Chave de comparação de nome de disciplina: sem acento, sem caixa.
 *
 * `\p{Diacritic}` sobre a forma decomposta em vez de uma faixa de code points
 * escrita à mão — a faixa some do arquivo em qualquer normalização de encoding,
 * e ninguém percebe até "matematica" parar de casar com "Matemática".
 */
const semAcento = (s: string) =>
  s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

@Injectable()
export class CadeirasService {
  constructor(private readonly prisma: PrismaService) {}

  listar(professorId: string, incluirInativas = false) {
    return this.prisma.cadeira.findMany({
      where: { professorId, ...(incluirInativas ? {} : { ativo: true }) },
      orderBy: [{ disciplina: 'asc' }, { turma: 'asc' }],
      include: {
        escola: { select: { id: true, nome: true } },
        // As unidades moraram na cadeira até a fase 3; agora moram no plano
        // curricular, que várias turmas irmãs compartilham. Por isso a contagem
        // vem de dentro do plano em vez de sair no `_count` da cadeira.
        plano: {
          select: { id: true, nome: true, _count: { select: { unidades: true } } },
        },
        _count: { select: { series: true } },
      },
    });
  }

  /**
   * As disciplinas que esta conta já usou, para a tela sugerir enquanto ela
   * digita.
   *
   * Inclui cadeira inativa e plano de propósito: "Matemática" do semestre
   * passado continua sendo a grafia certa deste semestre, e é exatamente aí que
   * a sugestão evita criar "Matematica" ao lado de "Matemática" — duas
   * disciplinas para o sistema, uma só para ela.
   *
   * A deduplicação ignora acento e caixa mas devolve a grafia que ela escreveu
   * primeiro: normalizar a saída "consertaria" o nome dela sem pedir licença.
   */
  async disciplinas(professorId: string): Promise<string[]> {
    const [cadeiras, planos] = await Promise.all([
      this.prisma.cadeira.findMany({
        where: { professorId },
        select: { disciplina: true },
        distinct: ['disciplina'],
      }),
      this.prisma.planoCurricular.findMany({
        where: { professorId, disciplina: { not: null } },
        select: { disciplina: true },
        distinct: ['disciplina'],
      }),
    ]);

    const vistas = new Map<string, string>();
    for (const nome of [...cadeiras, ...planos].map((x) => x.disciplina?.trim())) {
      if (!nome) continue;
      if (!vistas.has(semAcento(nome))) vistas.set(semAcento(nome), nome);
    }

    return [...vistas.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }

  async buscar(professorId: string, id: string) {
    const cadeira = await this.prisma.cadeira.findFirst({
      where: { id, professorId },
      include: {
        escola: { select: { id: true, nome: true } },
        plano: {
          include: {
            unidades: {
              orderBy: { ordem: 'asc' },
              include: { topicos: { orderBy: { ordem: 'asc' } } },
            },
          },
        },
        config: true,
      },
    });
    if (!cadeira) throw new NotFoundException('Cadeira não encontrada.');
    return cadeira;
  }

  async criar(professorId: string, dto: CreateCadeiraDto) {
    await this.validarEscola(professorId, dto.escolaId);
    await this.validarPlano(professorId, dto.planoCurricularId);

    // Cor escolhida aqui, e não deixada no `@default` do schema: o default dava
    // a MESMA cor para todas, e no calendário onze pontos azuis idênticos não
    // identificam turma nenhuma. Ela pode mandar a dela; se não mandar, pega a
    // primeira livre.
    const corHex = dto.corHex ?? proximaCor(await this.coresEmUso(professorId));

    return this.prisma.cadeira.create({ data: { ...dto, corHex, professorId } });
  }

  private async coresEmUso(professorId: string): Promise<string[]> {
    const cadeiras = await this.prisma.cadeira.findMany({
      where: { professorId, ativo: true },
      select: { corHex: true },
    });
    return cadeiras.map((c) => c.corHex);
  }

  async atualizar(professorId: string, id: string, dto: UpdateCadeiraDto) {
    await this.buscar(professorId, id);
    await this.validarEscola(professorId, dto.escolaId);
    await this.validarPlano(professorId, dto.planoCurricularId);
    return this.prisma.cadeira.update({ where: { id }, data: dto });
  }

  /**
   * Desativa em vez de apagar.
   *
   * `cadeira → ocorrencia` é cascade, então um delete levaria junto todo o
   * histórico de aulas dadas — exatamente o que a professora não pode perder.
   * Quem quiser sumir com a cadeira da tela usa `ativo: false`.
   *
   * **As aulas futuras são canceladas junto, e é isso que faz o botão dizer a
   * verdade.** O varredor de alarmes filtra por `status` e `inicioEm` e não
   * olha `cadeira.ativo` — nem deveria, porque ele roda a cada minuto para
   * todas as contas e o índice que o sustenta é `[status, inicioEm]`. Sem este
   * passo, arquivar a turma a tirava da tela e os dois alarmes continuavam
   * tocando pelo resto do semestre: a turma some, o alarme fica, e não sobra
   * nada na tela que explique de onde ele vem.
   *
   * **Só as futuras.** Aula que já passou é histórico e pode ter registro;
   * mudar o status dela tiraria do progresso e da contagem justamente o que ela
   * deu. O corte é por `inicioEm`, o instante absoluto — comparar a data pura
   * marcaria como cancelada a aula de hoje à tarde.
   */
  async desativar(professorId: string, id: string) {
    await this.buscar(professorId, id);
    const agora = new Date();

    const [, , futuras] = await this.prisma.$transaction([
      this.prisma.cadeira.update({ where: { id }, data: { ativo: false } }),
      // Séries de uma cadeira desativada param de gerar ocorrências novas.
      this.prisma.serieAula.updateMany({ where: { cadeiraId: id }, data: { ativo: false } }),
      this.prisma.ocorrencia.updateMany({
        where: {
          cadeiraId: id,
          professorId,
          status: StatusOcorrencia.AGENDADA,
          inicioEm: { gte: agora },
        },
        // As duas marcas de notificação vão junto porque é o que o cancelamento
        // pela tela da aula faz (`AgendaService.atualizar`). Dois caminhos de
        // cancelamento que deixam a linha em estados diferentes é como nasce um
        // "cancelei e o alarme tocou assim mesmo".
        data: {
          status: StatusOcorrencia.CANCELADA,
          aberturaNotificadaEm: agora,
          fechamentoNotificadoEm: agora,
        },
      }),
    ]);

    // A contagem sobe para a tela porque é o que ela precisa conferir: "13
    // aulas futuras canceladas" é verificável na grade, "ok" não é.
    return { ok: true, aulasCanceladas: futuras.count };
  }

  /**
   * Config de alarme *efetiva* da cadeira — padrões da conta com o override
   * aplicado por cima.
   *
   * A tela precisa mostrar os dois: o valor que vale hoje e se ele veio do
   * padrão ou de um ajuste dela. Sem essa distinção, "5 minutos" na tela é
   * ambíguo — ela não sabe se mexer ali afeta uma cadeira ou onze.
   */
  async configAlarme(professorId: string, cadeiraId: string) {
    await this.buscar(professorId, cadeiraId);

    const [professor, override] = await Promise.all([
      this.prisma.professor.findUniqueOrThrow({ where: { id: professorId } }),
      this.prisma.configAlarme.findUnique({ where: { cadeiraId } }),
    ]);

    return {
      efetiva: resolverAlarme(professor, override),
      override,
      padroesDaConta: {
        antecedenciaMin: professor.antecedenciaPadraoMin,
        atrasoMin: professor.atrasoPadraoMin,
        intensidadeAbertura: professor.intensidadeAberturaPadrao,
        intensidadeFechamento: professor.intensidadeFechamentoPadrao,
        som: professor.somPadrao,
        vibra: professor.vibraPadrao,
      },
    };
  }

  async salvarConfigAlarme(professorId: string, cadeiraId: string, dto: UpsertConfigAlarmeDto) {
    await this.buscar(professorId, cadeiraId);

    await this.prisma.configAlarme.upsert({
      where: { cadeiraId },
      create: { professorId, cadeiraId, ...dto },
      update: dto,
    });

    return this.configAlarme(professorId, cadeiraId);
  }

  /** Remove o override — a cadeira volta a herdar os padrões da conta. */
  async limparConfigAlarme(professorId: string, cadeiraId: string) {
    await this.buscar(professorId, cadeiraId);
    await this.prisma.configAlarme.deleteMany({ where: { cadeiraId, professorId } });
    return this.configAlarme(professorId, cadeiraId);
  }

  private async validarEscola(professorId: string, escolaId?: string) {
    if (!escolaId) return;
    const escola = await this.prisma.escola.findFirst({
      where: { id: escolaId, professorId },
      select: { id: true },
    });
    // Sem esta checagem, um escolaId de outro professor passaria pela FK (ela só
    // valida existência) e criaria um vínculo entre contas.
    if (!escola) throw new BadRequestException('Escola não encontrada.');
  }

  /** Mesmo motivo do `validarEscola`: a FK confere existência, não dono. */
  private async validarPlano(professorId: string, planoCurricularId?: string) {
    if (!planoCurricularId) return;
    const plano = await this.prisma.planoCurricular.findFirst({
      where: { id: planoCurricularId, professorId },
      select: { id: true },
    });
    if (!plano) throw new BadRequestException('Plano curricular não encontrado.');
  }
}
