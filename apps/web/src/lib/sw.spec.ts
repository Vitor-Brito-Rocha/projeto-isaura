import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * O `sw.js` mora em `public/` e não é importável — então este teste LÊ o
 * arquivo e o executa contra um `self` de mentira.
 *
 * Vale o incômodo porque é a única lógica do produto que roda fora da página e
 * falha em silêncio absoluto: clique que não abre nada não gera erro na tela,
 * não gera log na API e não aparece em `next build`. Foi assim que o alarme
 * passou a abrir a tela errada no iPhone sem ninguém notar.
 */
type Ouvintes = Record<string, (evento: any) => void>;

function carregarSw() {
  const codigo = readFileSync(join(__dirname, '..', '..', 'public', 'sw.js'), 'utf-8');
  const ouvintes: Ouvintes = {};

  const self: any = {
    addEventListener: (nome: string, fn: (e: any) => void) => {
      ouvintes[nome] = fn;
    },
    location: { origin: 'https://aulas.exemplo' },
    registration: { showNotification: jest.fn() },
    skipWaiting: jest.fn(),
    clients: {
      claim: jest.fn(),
      matchAll: jest.fn().mockResolvedValue([]),
      openWindow: jest.fn().mockResolvedValue(undefined),
    },
  };

  new Function('self', codigo)(self);
  return { self, ouvintes };
}

function abaFalsa(url: string, navigate?: jest.Mock) {
  return {
    url,
    focus: jest.fn().mockResolvedValue(undefined),
    postMessage: jest.fn(),
    ...(navigate ? { navigate } : {}),
  };
}

async function clicar(ouvintes: Ouvintes, data: unknown, action = '') {
  let espera: Promise<unknown> = Promise.resolve();
  ouvintes.notificationclick({
    action,
    notification: { close: jest.fn(), data },
    waitUntil: (p: Promise<unknown>) => {
      espera = p;
    },
  });
  await espera;
}

const ALARME = {
  url: '/aula?ocorrencia=oc-1&momento=fechamento',
  ocorrenciaId: 'oc-1',
  tipo: 'FECHAMENTO_AULA',
};

describe('clique na notificação', () => {
  it('abre a tela da aula quando o app está fechado', async () => {
    const { self, ouvintes } = carregarSw();
    self.clients.matchAll.mockResolvedValue([]);

    await clicar(ouvintes, ALARME);

    expect(self.clients.openWindow).toHaveBeenCalledWith(
      '/aula?ocorrencia=oc-1&momento=fechamento',
    );
  });

  it('leva a aba aberta para a aula, pelos dois caminhos', async () => {
    const navigate = jest.fn().mockResolvedValue(undefined);
    const aba = abaFalsa('https://aulas.exemplo/historico', navigate);
    const { self, ouvintes } = carregarSw();
    self.clients.matchAll.mockResolvedValue([aba]);

    await clicar(ouvintes, ALARME);

    // O `postMessage` é o que funciona no iPhone em segundo plano; o
    // `navigate` é o que funciona no Android e no navegador. Os dois.
    expect(aba.postMessage).toHaveBeenCalledWith({
      tipo: 'ir-para',
      url: '/aula?ocorrencia=oc-1&momento=fechamento',
    });
    expect(navigate).toHaveBeenCalledWith('/aula?ocorrencia=oc-1&momento=fechamento');
    expect(aba.focus).toHaveBeenCalled();
    expect(self.clients.openWindow).not.toHaveBeenCalled();
  });

  it('ainda abre o app quando o navigate rejeita', async () => {
    // `navigate()` rejeita em aba não controlada por este service worker, e
    // `includeUncontrolled: true` pede exatamente essas. Sem o catch, a
    // rejeição derrubava o `waitUntil` e o clique não fazia NADA.
    const navigate = jest.fn().mockRejectedValue(new TypeError('não controlada'));
    const aba = abaFalsa('https://aulas.exemplo/', navigate);
    const { self, ouvintes } = carregarSw();
    self.clients.matchAll.mockResolvedValue([aba]);

    await expect(clicar(ouvintes, ALARME)).resolves.toBeUndefined();

    expect(aba.postMessage).toHaveBeenCalled();
    expect(aba.focus).toHaveBeenCalled();
  });

  it('não estoura onde navigate não existe', async () => {
    const aba = abaFalsa('https://aulas.exemplo/');
    const { self, ouvintes } = carregarSw();
    self.clients.matchAll.mockResolvedValue([aba]);

    await expect(clicar(ouvintes, ALARME)).resolves.toBeUndefined();

    expect(aba.postMessage).toHaveBeenCalled();
    expect(aba.focus).toHaveBeenCalled();
  });

  it('só foca quando a aba já está naquela aula', async () => {
    // Recarregar aqui apagaria o que ela já digitou e ainda não salvou.
    const navigate = jest.fn().mockResolvedValue(undefined);
    const aba = abaFalsa(
      'https://aulas.exemplo/aula?ocorrencia=oc-1&momento=fechamento',
      navigate,
    );
    const { self, ouvintes } = carregarSw();
    self.clients.matchAll.mockResolvedValue([aba]);

    await clicar(ouvintes, ALARME);

    expect(navigate).not.toHaveBeenCalled();
    expect(aba.postMessage).not.toHaveBeenCalled();
    expect(aba.focus).toHaveBeenCalled();
  });

  it('a aula da notificação e não a outra', async () => {
    const navigate = jest.fn().mockResolvedValue(undefined);
    const aba = abaFalsa('https://aulas.exemplo/aula?ocorrencia=OUTRA', navigate);
    const { self, ouvintes } = carregarSw();
    self.clients.matchAll.mockResolvedValue([aba]);

    await clicar(ouvintes, ALARME);

    expect(navigate).toHaveBeenCalledWith('/aula?ocorrencia=oc-1&momento=fechamento');
  });

  it('o botão Registrar abre a mesma tela', async () => {
    const navigate = jest.fn().mockResolvedValue(undefined);
    const aba = abaFalsa('https://aulas.exemplo/', navigate);
    const { self, ouvintes } = carregarSw();
    self.clients.matchAll.mockResolvedValue([aba]);

    await clicar(ouvintes, ALARME, 'registrar');

    expect(navigate).toHaveBeenCalledWith('/aula?ocorrencia=oc-1');
  });

  it('sem url no payload, vai para a semana', async () => {
    const { self, ouvintes } = carregarSw();
    self.clients.matchAll.mockResolvedValue([]);

    await clicar(ouvintes, { tipo: 'GERAL' });

    expect(self.clients.openWindow).toHaveBeenCalledWith('/');
  });
});
