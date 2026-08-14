import { Controller, Get } from '@nestjs/common';
import { Public } from './auth/public.decorator';
import { PrismaService } from './prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async health() {
    // Toca o banco de propósito: um health que só devolve "ok" fica verde com o
    // Postgres fora do ar, e aí o deploy passa e o app não funciona.
    let banco = 'ok';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      banco = 'indisponível';
    }
    return { ok: banco === 'ok', banco, agora: new Date().toISOString() };
  }
}
