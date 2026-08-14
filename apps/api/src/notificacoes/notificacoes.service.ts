import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificacoesService {
  constructor(private readonly prisma: PrismaService) {}

  listar(professorId: string, apenasNaoLidas = false) {
    return this.prisma.notificacao.findMany({
      where: { professorId, ...(apenasNaoLidas ? { lida: false } : {}) },
      orderBy: { criadoEm: 'desc' },
      take: 100,
    });
  }

  async contarNaoLidas(professorId: string) {
    return { naoLidas: await this.prisma.notificacao.count({ where: { professorId, lida: false } }) };
  }

  async marcarLida(professorId: string, id: string) {
    // updateMany + professorId no where, não update por id: assim um id de
    // outro professor simplesmente não afeta nada, em vez de dar 500 no update.
    await this.prisma.notificacao.updateMany({
      where: { id, professorId },
      data: { lida: true },
    });
    return { ok: true };
  }

  async marcarTodasLidas(professorId: string) {
    const { count } = await this.prisma.notificacao.updateMany({
      where: { professorId, lida: false },
      data: { lida: true },
    });
    return { marcadas: count };
  }
}
