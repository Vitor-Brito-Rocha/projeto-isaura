import { apiFetch, ApiError, podeRenovar } from './api';

/**
 * O que estes testes protegem: a sessão sobreviver mais de uma hora.
 *
 * O access token do Supabase dura ~1h e o refresh dura 30 dias. Sem a renovação
 * automática, a professora era jogada para o login a cada hora — no meio do
 * registro de uma aula, com sessão perfeitamente válida no cookie.
 */
describe('apiFetch — renovação de sessão', () => {
  let chamadas: string[];

  /** Responde 401 nas N primeiras vezes de cada caminho, depois 200. */
  function fingirServidor(opcoes: { refreshOk: boolean; falhasAntesDeRenovar?: number }) {
    const restantes = new Map<string, number>();

    global.fetch = jest.fn(async (url: string | URL | Request) => {
      const caminho = String(url);
      chamadas.push(caminho);

      if (caminho.endsWith('/auth/refresh')) {
        return { ok: opcoes.refreshOk, status: opcoes.refreshOk ? 200 : 401, json: async () => ({}) };
      }

      const faltam = restantes.get(caminho) ?? (opcoes.falhasAntesDeRenovar ?? 1);
      if (faltam > 0) {
        restantes.set(caminho, faltam - 1);
        return { ok: false, status: 401, json: async () => ({ message: 'expirado' }) };
      }
      return { ok: true, status: 200, json: async () => ({ certo: true }) };
    }) as unknown as typeof fetch;
  }

  beforeEach(() => {
    chamadas = [];
  });

  it('renova e repete a chamada quando leva 401', async () => {
    fingirServidor({ refreshOk: true });

    await expect(apiFetch('/cadeiras')).resolves.toEqual({ certo: true });

    expect(chamadas.filter((c) => c.endsWith('/auth/refresh'))).toHaveLength(1);
    expect(chamadas.filter((c) => c.endsWith('/cadeiras'))).toHaveLength(2);
  });

  it('desiste com 401 quando a renovação também falha', async () => {
    fingirServidor({ refreshOk: false });

    await expect(apiFetch('/cadeiras')).rejects.toBeInstanceOf(ApiError);
    // Não repete a chamada original se a renovação não deu certo.
    expect(chamadas.filter((c) => c.endsWith('/cadeiras'))).toHaveLength(1);
  });

  it('não tenta renovar em rota de auth — 401 ali é senha errada, não sessão velha', async () => {
    fingirServidor({ refreshOk: true });

    await expect(apiFetch('/auth/login', { method: 'POST' })).rejects.toBeInstanceOf(ApiError);

    expect(chamadas.filter((c) => c.endsWith('/auth/refresh'))).toHaveLength(0);
  });

  it('marca sessaoMorta só quando a renovação falhou', async () => {
    // É o que separa "este endpoint recusou" de "não há sessão nenhuma" — e o
    // que faz a tela ir direto ao login em vez de passar pela home.
    fingirServidor({ refreshOk: false });
    await expect(apiFetch('/cadeiras')).rejects.toMatchObject({ status: 401, sessaoMorta: true });
  });

  it('401 que sobrevive a uma renovação BEM-sucedida não é sessão morta', async () => {
    // A sessão está viva; quem recusou foi o endpoint. Derrubar o login aqui
    // deixaria um endpoint com problema expulsar a professora do app.
    fingirServidor({ refreshOk: true, falhasAntesDeRenovar: 2 });
    await expect(apiFetch('/cadeiras')).rejects.toMatchObject({ status: 401, sessaoMorta: false });
  });

  it('renova em /auth/eu — token vencido com refresh válido é o caso normal', async () => {
    // A regra por prefixo `/auth/` barrava a renovação aqui e jogava para o
    // login quem só estava com o access token de uma hora vencido.
    fingirServidor({ refreshOk: true });
    await expect(apiFetch('/auth/eu')).resolves.toEqual({ certo: true });
    expect(chamadas.filter((c) => c.endsWith('/auth/refresh'))).toHaveLength(1);
  });
  it('renova UMA vez só quando várias chamadas levam 401 juntas', async () => {
    fingirServidor({ refreshOk: true });

    await Promise.all([apiFetch('/cadeiras'), apiFetch('/planos'), apiFetch('/agenda')]);

    // O Supabase rotaciona o refresh token a cada uso: uma segunda renovação
    // em paralelo chegaria com token gasto e derrubaria a sessão recém-criada.
    expect(chamadas.filter((c) => c.endsWith('/auth/refresh'))).toHaveLength(1);
  });
});

/**
 * Um desfecho que parece bug do app e não é.
 *
 * Testando o front publicado contra a API por um túnel do ngrok gratuito, ele
 * intercepta o que tem cara de navegador e responde a SUA página de aviso:
 * `200 OK` com `content-type: text/html` e `ngrok-error-code: ERR_NGROK_6024`,
 * sem chamar a API. O `resposta.json()` estoura em cima de HTML e a tela mostra
 * uma falha genérica — status 200 na aba de rede, nada no log da API, e nenhuma
 * pista de que o problema está no túnel.
 *
 * O header resolve, e precisa estar em TODA chamada: uma que escape volta HTML
 * e derruba a tela sozinha.
 */
describe('apiFetch — cabeçalhos', () => {
  function capturar() {
    const feitas: { url: string; init: RequestInit }[] = [];
    global.fetch = jest.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
      feitas.push({ url: String(url), init });
      if (String(url).endsWith('/auth/refresh')) return { ok: true, status: 200, json: async () => ({}) };
      // 401 na primeira, para o refresh entrar na conversa também.
      const jaTentou = feitas.filter((f) => f.url === String(url)).length > 1;
      return jaTentou
        ? { ok: true, status: 200, json: async () => ({}) }
        : { ok: false, status: 401, json: async () => ({}) };
    }) as unknown as typeof fetch;
    return feitas;
  }

  it('manda o header que faz o ngrok repassar em vez de mostrar a página dele', async () => {
    const feitas = capturar();
    await apiFetch('/progresso');

    const cabecalhos = feitas.map((f) => f.init.headers as Record<string, string>);
    expect(cabecalhos.every((h) => h['ngrok-skip-browser-warning'])).toBe(true);
  });

  it('a renovação também leva — senão o refresh volta HTML e a sessão morre', async () => {
    const feitas = capturar();
    await apiFetch('/progresso');

    const refresh = feitas.find((f) => f.url.endsWith('/auth/refresh'))!;
    expect((refresh.init.headers as Record<string, string>)['ngrok-skip-browser-warning']).toBeTruthy();
  });

  it('quem chama ainda manda no que passa — o header do caller ganha', async () => {
    const feitas = capturar();
    await apiFetch('/progresso', { headers: { 'Content-Type': 'text/plain' } });

    const primeira = feitas[0].init.headers as Record<string, string>;
    expect(primeira['Content-Type']).toBe('text/plain');
    expect(primeira['ngrok-skip-browser-warning']).toBeTruthy();
  });
});

describe('podeRenovar', () => {
  it('as rotas que ESTABELECEM sessão ficam de fora', () => {
    // Renovar depois de um 401 de senha errada viraria laço.
    expect(podeRenovar('/auth/login')).toBe(false);
    expect(podeRenovar('/auth/signup')).toBe(false);
    expect(podeRenovar('/auth/refresh')).toBe(false);
    expect(podeRenovar('/auth/logout')).toBe(false);
  });

  it('rota autenticada comum renova, inclusive sob /auth', () => {
    expect(podeRenovar('/auth/eu')).toBe(true);
    expect(podeRenovar('/cadeiras')).toBe(true);
    expect(podeRenovar('/registros/ocorrencia/abc')).toBe(true);
  });
});
