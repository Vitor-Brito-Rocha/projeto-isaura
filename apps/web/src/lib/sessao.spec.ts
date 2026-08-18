import { ApiError } from './api';
import { avisoDoErro, destinoDoErro, sessaoAusente } from './sessao';

describe('destinoDoErro', () => {
  it('401 fora da home manda para a home, não para o login', () => {
    // O `apiFetch` já tentou renovar a sessão antes de desistir, mas um
    // endpoint com problema derrubaria a sessão inteira se a primeira queda
    // fosse direto para o login.
    expect(destinoDoErro(new ApiError(401, 'x'), '/cadeiras')).toBe('/');
    expect(destinoDoErro(new ApiError(401, 'x'), '/aula/abc')).toBe('/');
  });

  it('401 na home manda para o login — é o segundo degrau', () => {
    // Se a própria home não carrega, aí é sessão mesmo.
    expect(destinoDoErro(new ApiError(401, 'x'), '/')).toBe('/login');
  });

  it('404 segue o mesmo caminho', () => {
    // Endereço guardado de uma aula apagada: melhor voltar para a semana do
    // que ficar num cartão de erro sem saída.
    expect(destinoDoErro(new ApiError(404, 'x'), '/aula/apagada')).toBe('/');
    expect(destinoDoErro(new ApiError(404, 'x'), '/')).toBe('/login');
  });

  it('sessão morta pula o degrau da home e vai direto ao login', () => {
    // Aqui a renovação já foi tentada e falhou: não existe sessão. Mandar para
    // a home só faria ela ver a mesma queda de novo, um clique depois.
    expect(destinoDoErro(new ApiError(401, 'x', true), '/cadeiras')).toBe('/login');
    expect(destinoDoErro(new ApiError(401, 'x', true), '/planos')).toBe('/login');
    expect(destinoDoErro(new ApiError(401, 'x', true), '/')).toBe('/login');
  });

  it('403 não redireciona — é "área restrita", não sessão morta', () => {
    // O painel de admin devolve 403 para quem não é admin, e tirá-la da tela
    // esconderia a explicação.
    expect(destinoDoErro(new ApiError(403, 'x'), '/admin')).toBeNull();
  });

  it('erro de rede ou 500 não redireciona', () => {
    expect(destinoDoErro(new ApiError(500, 'x'), '/cadeiras')).toBeNull();
    expect(destinoDoErro(new Error('sem rede'), '/cadeiras')).toBeNull();
    expect(destinoDoErro(null, '/cadeiras')).toBeNull();
    expect(destinoDoErro(undefined, '/')).toBeNull();
  });
});

describe('avisoDoErro', () => {
  it('no login, fala de sessão', () => {
    expect(avisoDoErro(401, '/login')).toMatch(/sessão expirou/i);
  });

  it('na home, o 404 explica que a página sumiu', () => {
    expect(avisoDoErro(404, '/')).toMatch(/não existe mais/i);
  });

  it('nunca teleporta em silêncio', () => {
    for (const status of [401, 404]) {
      for (const destino of ['/', '/login']) {
        expect(avisoDoErro(status, destino).length).toBeGreaterThan(10);
      }
    }
  });
});


describe('sessaoAusente', () => {
  it('só 401 significa deslogada', () => {
    expect(sessaoAusente(new ApiError(401, 'sem token'))).toBe(true);
    expect(sessaoAusente(new ApiError(401, 'sem token', true))).toBe(true);
  });

  it('rede caída NÃO é sessão ausente', () => {
    // O produto existe para ser usado numa sala sem sinal, com registro na
    // fila esperando para subir. Expulsar para o login ali perderia o gesto.
    expect(sessaoAusente(new TypeError('Failed to fetch'))).toBe(false);
    expect(sessaoAusente(new Error('offline'))).toBe(false);
    expect(sessaoAusente(undefined)).toBe(false);
    expect(sessaoAusente(null)).toBe(false);
  });

  it('403 e 500 também não', () => {
    // 403 é "área restrita" (o painel de admin), não sessão morta.
    expect(sessaoAusente(new ApiError(403, 'restrito'))).toBe(false);
    expect(sessaoAusente(new ApiError(500, 'boom'))).toBe(false);
  });
});
