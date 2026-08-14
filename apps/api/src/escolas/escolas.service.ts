import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEscolaDto, UpdateEscolaDto } from './dto/escola.dto';

@Injectable()
export class EscolasService {
  constructor(private readonly prisma: PrismaService) {}

  listar(professorId: string) {
    return this.prisma.escola.findMany({
      where: { professorId },
      orderBy: { nome: 'asc' },
      include: { _count: { select: { cadeiras: true } } },
    });
  }

  criar(professorId: string, dto: CreateEscolaDto) {
    return this.prisma.escola.create({ data: { ...dto, professorId } });
  }

  /**
   * Busca garantindo que o registro é do professor autenticado.
   *
   * O `professorId` no `where` é o que impede IDOR: sem ele, qualquer um com um
   * uuid válido leria a escola de outro professor. Toda leitura por id neste
   * projeto passa por um método assim.
   */
  async buscar(professorId: string, id: string) {
    const escola = await this.prisma.escola.findFirst({ where: { id, professorId } });
    if (!escola) throw new NotFoundException('Escola não encontrada.');
    return escola;
  }

  async atualizar(professorId: string, id: string, dto: UpdateEscolaDto) {
    await this.buscar(professorId, id);
    return this.prisma.escola.update({ where: { id }, data: dto });
  }

  async remover(professorId: string, id: string) {
    await this.buscar(professorId, id);
    // As cadeiras sobrevivem com escolaId nulo (onDelete: SetNull) — apagar a
    // escola não pode levar junto o histórico de aulas que já aconteceram.
    await this.prisma.escola.delete({ where: { id } });
    return { ok: true };
  }
}
