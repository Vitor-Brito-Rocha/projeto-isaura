import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCadeiraDto, UpdateCadeiraDto } from './dto/cadeira.dto';

@Injectable()
export class CadeirasService {
  constructor(private readonly prisma: PrismaService) {}

  listar(professorId: string, incluirInativas = false) {
    return this.prisma.cadeira.findMany({
      where: { professorId, ...(incluirInativas ? {} : { ativo: true }) },
      orderBy: [{ disciplina: 'asc' }, { turma: 'asc' }],
      include: {
        escola: { select: { id: true, nome: true } },
        _count: { select: { series: true, unidades: true } },
      },
    });
  }

  async buscar(professorId: string, id: string) {
    const cadeira = await this.prisma.cadeira.findFirst({
      where: { id, professorId },
      include: {
        escola: { select: { id: true, nome: true } },
        unidades: { orderBy: { ordem: 'asc' }, include: { topicos: { orderBy: { ordem: 'asc' } } } },
        config: true,
      },
    });
    if (!cadeira) throw new NotFoundException('Cadeira não encontrada.');
    return cadeira;
  }

  async criar(professorId: string, dto: CreateCadeiraDto) {
    await this.validarEscola(professorId, dto.escolaId);
    return this.prisma.cadeira.create({ data: { ...dto, professorId } });
  }

  async atualizar(professorId: string, id: string, dto: UpdateCadeiraDto) {
    await this.buscar(professorId, id);
    await this.validarEscola(professorId, dto.escolaId);
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
}
