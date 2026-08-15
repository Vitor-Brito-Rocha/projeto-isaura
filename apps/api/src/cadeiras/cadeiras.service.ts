import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { resolverAlarme } from '../alarmes/resolver-alarme';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCadeiraDto, UpdateCadeiraDto } from './dto/cadeira.dto';
import { UpsertConfigAlarmeDto } from './dto/config-alarme.dto';

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
    return this.prisma.cadeira.create({ data: { ...dto, professorId } });
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
   */
  async desativar(professorId: string, id: string) {
    await this.buscar(professorId, id);
    await this.prisma.$transaction([
      this.prisma.cadeira.update({ where: { id }, data: { ativo: false } }),
      // Séries de uma cadeira desativada param de gerar ocorrências novas.
      this.prisma.serieAula.updateMany({ where: { cadeiraId: id }, data: { ativo: false } }),
    ]);
    return { ok: true };
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
