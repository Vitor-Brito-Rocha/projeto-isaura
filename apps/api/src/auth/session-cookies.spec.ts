import type { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { ACCESS_COOKIE, clearSessionCookies, REFRESH_COOKIE, setSessionCookies } from './session-cookies';

function configFalsa(valores: Record<string, string>): ConfigService {
  return { get: (chave: string) => valores[chave] } as unknown as ConfigService;
}

/** Guarda o que foi para `res.cookie`, que é onde a decisão aparece. */
function respostaFalsa() {
  const postos: { nome: string; valor: string; opcoes: any }[] = [];
  const res = {
    cookie: (nome: string, valor: string, opcoes: any) => postos.push({ nome, valor, opcoes }),
    clearCookie: (nome: string, opcoes: any) => postos.push({ nome, valor: '', opcoes }),
  } as unknown as Response;
  return { res, postos, de: (nome: string) => postos.find((p) => p.nome === nome)! };
}

const SESSAO = {
  access_token: 'a',
  refresh_token: 'r',
  expires_in: 3600,
  user: { id: 'u' },
};

describe('cookies de sessão', () => {
  describe('caminho normal do navegador', () => {
    it('fica em Lax — o front fala com a origem do Next, que repassa', () => {
      const { res, de } = respostaFalsa();
      setSessionCookies(configFalsa({ NODE_ENV: 'production' }), res, SESSAO);

      expect(de(ACCESS_COOKIE).opcoes.sameSite).toBe('lax');
      expect(de(ACCESS_COOKIE).opcoes.secure).toBe(true);
      expect(de(ACCESS_COOKIE).opcoes.httpOnly).toBe(true);
    });

    it('não pede secure em desenvolvimento: sobre http o navegador recusaria', () => {
      const { res, de } = respostaFalsa();
      setSessionCookies(configFalsa({ NODE_ENV: 'development' }), res, SESSAO);

      expect(de(ACCESS_COOKIE).opcoes.secure).toBe(false);
    });
  });

  describe('front em outro site (túnel, VPS, wrapper)', () => {
    /**
     * O que este arquivo existe para travar.
     *
     * Com `Lax`, o navegador GUARDA o cookie e não o manda numa chamada entre
     * sites — o login parece dar certo e a tela seguinte já está deslogada, sem
     * erro nenhum na tela nem no log. É o tipo de falha que só aparece no
     * aparelho, depois do deploy.
     */
    it('vira None quando COOKIE_CROSS_SITE=1', () => {
      const { res, de } = respostaFalsa();
      setSessionCookies(configFalsa({ COOKIE_CROSS_SITE: '1', NODE_ENV: 'development' }), res, SESSAO);

      expect(de(ACCESS_COOKIE).opcoes.sameSite).toBe('none');
      expect(de(REFRESH_COOKIE).opcoes.sameSite).toBe('none');
    });

    /**
     * `None` sem `Secure` é cookie descartado pelo navegador, calado. Andam
     * juntos mesmo fora de produção, senão ligar a variável em dev daria
     * exatamente o mesmo sintoma que ela deveria consertar.
     */
    it('força secure junto, mesmo fora de produção', () => {
      const { res, de } = respostaFalsa();
      setSessionCookies(configFalsa({ COOKIE_CROSS_SITE: '1', NODE_ENV: 'development' }), res, SESSAO);

      expect(de(ACCESS_COOKIE).opcoes.secure).toBe(true);
    });

    it('só o "1" exato liga — variável vazia ou "true" seguem em Lax', () => {
      for (const valor of ['', '0', 'true']) {
        const { res, de } = respostaFalsa();
        setSessionCookies(configFalsa({ COOKIE_CROSS_SITE: valor }), res, SESSAO);
        expect(de(ACCESS_COOKIE).opcoes.sameSite).toBe('lax');
      }
    });
  });

  /**
   * Apagar cookie só funciona com os MESMOS atributos com que ele foi posto —
   * o navegador trata `SameSite`/`path` diferentes como outro cookie e o antigo
   * fica lá. Sair da conta num front cross-site não pode deixar a sessão viva.
   */
  it('limpa com os mesmos atributos, senão o cookie sobrevive ao logout', () => {
    const { res, de } = respostaFalsa();
    clearSessionCookies(configFalsa({ COOKIE_CROSS_SITE: '1' }), res);

    expect(de(ACCESS_COOKIE).opcoes.sameSite).toBe('none');
    expect(de(ACCESS_COOKIE).opcoes.secure).toBe(true);
    expect(de(ACCESS_COOKIE).opcoes.path).toBe('/');
    expect(de(REFRESH_COOKIE).opcoes.sameSite).toBe('none');
  });
});
