import { Controller, Get } from '@nestjs/common';
import { hostname } from 'node:os';
import { Public } from './auth/public.decorator';
import { PrismaService } from './prisma/prisma.service';

/** Quando ESTE processo subiu. Constante do módulo: não muda entre chamadas. */
const INICIADO_EM = new Date().toISOString();

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

    return {
      ok: banco === 'ok',
      banco,
      agora: new Date().toISOString(),
      /**
       * QUEM respondeu, e desde quando.
       *
       * Com mais de um container atrás da mesma rota — deploy que deixou o
       * anterior de pé —, a MESMA url alterna entre 200 e o erro do proxy, e de
       * fora não há como saber qual dos dois atendeu cada chamada. O sintoma é
       * "às vezes funciona", que é o mais caro de diagnosticar. Repetir o
       * health e ver a `instancia` mudando fecha a questão em cinco segundos.
       *
       * `hostname()` num container é o id curto dele, e `desde` denuncia o
       * container velho: ele subiu antes da mudança que você acabou de fazer.
       * Nada disso é segredo — é o mesmo que o painel já mostra a quem entra.
       */
      instancia: hostname(),
      desde: INICIADO_EM,
    };
  }
}
