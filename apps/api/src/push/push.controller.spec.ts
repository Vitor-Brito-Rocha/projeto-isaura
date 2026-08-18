import { TipoNotificacao } from '@prisma/client';
import { PushController } from './push.controller';
import type { PushService } from './push.service';

/**
 * Notificação com a mesma `tag` SUBSTITUI a anterior, e a plataforma não
 * re-alerta ao substituir: chega sem som e sem vibração. Quem pede o contrário
 * é o `renotify`, que o iOS não implementa.
 *
 * Com a tag fixa que existia aqui, o primeiro teste apitava no iPhone e todos
 * os seguintes chegavam mudos — o oposto do que um botão de teste serve para
 * provar. A professora conclui que o alarme não funciona no aparelho dela, e
 * desiste do produto na primeira semana.
 */
describe('PushController — push de teste', () => {
  function montar() {
    const enviados: { tag?: string; som?: boolean }[] = [];
    const push = {
      enviarPush: async (_id: string, payload: { tag?: string; som?: boolean }) => {
        enviados.push(payload);
        return 1;
      },
    } as unknown as PushService;
    return { controller: new PushController(push), enviados };
  }

  const professor = { id: 'prof-1', email: 'p@teste.dev', timezone: 'America/Sao_Paulo' };

  it('usa uma tag diferente a cada envio, senão o segundo chega mudo', async () => {
    const { controller, enviados } = montar();

    await controller.teste(professor, {});
    // O relógio tem resolução de milissegundo; sem esperar, dois envios no
    // mesmo tick nasceriam com a mesma tag e o teste passaria sem provar nada.
    await new Promise((r) => setTimeout(r, 2));
    await controller.teste(professor, {});

    expect(enviados).toHaveLength(2);
    expect(enviados[0].tag).not.toBe(enviados[1].tag);
  });

  it('pede som — é o que o teste existe para conferir', async () => {
    const { controller, enviados } = montar();
    await controller.teste(professor, {});

    expect(enviados[0].som).toBe(true);
  });

  it('respeita o tipo pedido, para conferir o ícone de cada alarme', async () => {
    const { controller, enviados } = montar();
    await controller.teste(professor, { tipo: TipoNotificacao.FECHAMENTO_AULA });

    expect(enviados[0]).toMatchObject({ tipo: TipoNotificacao.FECHAMENTO_AULA });
  });
});
