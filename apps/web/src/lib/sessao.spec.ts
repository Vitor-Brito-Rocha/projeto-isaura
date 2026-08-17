import { ApiError } from './api';
import { avisoDoErro, destinoDoErro } from './sessao';

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
