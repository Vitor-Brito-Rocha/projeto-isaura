import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdatePerfilDto } from './dto/perfil.dto';

@Injectable()
export class ProfessoresService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Garante que existe perfil para o usuário do Supabase Auth.
   *
   * `id` é o auth uid — a raiz de todo o multitenant. Existe como upsert porque
   * a conta pode nascer fora do fluxo de cadastro do app (convite, painel do
   * Supabase, provedor social) e o primeiro login precisa funcionar mesmo assim.
   */
  garantirPerfil(id: string, email: string, nome?: string) {
    return this.prisma.professor.upsert({
      where: { id },
      create: { id, email, nome: nome ?? email.split('@')[0] },
      update: { email },
    });
  }

  buscar(professorId: string) {
    return this.prisma.professor.findUnique({
      where: { id: professorId },
      select: {
        id: true,
        nome: true,
        email: true,
        timezone: true,
        antecedenciaPadraoMin: true,
        atrasoPadraoMin: true,
        intensidadeAberturaPadrao: true,
        intensidadeFechamentoPadrao: true,
        somPadrao: true,
        vibraPadrao: true,
        criadoEm: true,
      },
    });
  }

  atualizar(professorId: string, dto: UpdatePerfilDto) {
    return this.prisma.professor.update({
      where: { id: professorId },
      data: dto,
    });
  }
}
