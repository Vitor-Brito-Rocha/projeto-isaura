import { apiFetch, ApiError } from './api';

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

  it('renova UMA vez só quando várias chamadas levam 401 juntas', async () => {
    fingirServidor({ refreshOk: true });

    await Promise.all([apiFetch('/cadeiras'), apiFetch('/planos'), apiFetch('/agenda')]);

    // O Supabase rotaciona o refresh token a cada uso: uma segunda renovação
    // em paralelo chegaria com token gasto e derrubaria a sessão recém-criada.
    expect(chamadas.filter((c) => c.endsWith('/auth/refresh'))).toHaveLength(1);
  });
});
