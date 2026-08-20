/**
 * O Admin precisa estar em algum lugar em TODA largura de tela.
 *
 * Ele fica só na navegação do topo, que é de desktop. Quem cobre o celular é o
 * cartão da tela de Ajustes, que se esconde a partir do mesmo ponto em que a
 * navegação do topo aparece. Se os dois lados deixarem de casar, sobra uma
 * faixa de largura sem caminho nenhum para o painel — que foi exatamente o
 * estado anterior a este cartão existir, e ninguém percebe até tentar abrir o
 * painel naquele tamanho de tela: não há erro, não há log, só uma tela que não
 * oferece nada.
 */
import { NAV_SO_NO_DESKTOP, SO_NO_CELULAR } from './app-shell';

/** O prefixo de media query de uma classe do Tailwind (`sm:flex` → `sm`). */
function pontoDeTroca(classes: string, utilitario: string): string | undefined {
  return classes
    .split(/\s+/)
    .map((c) => new RegExp(`^([a-z0-9]+):${utilitario}$`).exec(c)?.[1])
    .find((p): p is string => p !== undefined);
}

describe('onde o Admin aparece', () => {
  it('as duas navegações trocam no MESMO ponto', () => {
    const topo = pontoDeTroca(NAV_SO_NO_DESKTOP, 'flex');
    const cartao = pontoDeTroca(SO_NO_CELULAR, 'hidden');

    expect(topo).toBeDefined();
    expect(cartao).toBe(topo);
  });

  it('a navegação do topo começa escondida', () => {
    // Sem o `hidden` sem modificador, ela apareceria no celular também — e o
    // cartão dos Ajustes viraria um segundo caminho para a mesma tela, ali
    // mesmo onde a barra de baixo já estaria mostrando o item.
    expect(NAV_SO_NO_DESKTOP.split(/\s+/)).toContain('hidden');
  });

  it('as classes são literais, e não montadas', () => {
    // O Tailwind varre o código atrás do TEXTO da classe. `${ponto}:hidden`
    // não gera CSS nenhum: o cartão apareceria no desktop também, sem erro em
    // lugar nenhum e sem nada no build para reclamar.
    for (const classe of [NAV_SO_NO_DESKTOP, SO_NO_CELULAR]) {
      expect(classe).not.toContain('$');
      expect(classe).not.toContain('`');
    }
  });
});
