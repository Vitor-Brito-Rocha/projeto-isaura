import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Button } from './button';

/**
 * Regressão: `Button asChild` derrubava a página inteira.
 *
 * O Slot do Radix exige UM filho e usa `React.Children.only`, que rejeita um
 * array de dois mesmo quando o primeiro é falsy. Como o Button sempre
 * renderizava `{loading && <Loader2/>}` antes de `{children}`, todo `asChild`
 * estourava em runtime — a home caiu no estado vazio, e o erro não aparecia nem
 * no `tsc` nem no `next build`, só ao renderizar de verdade.
 *
 * Sem testing-library de propósito: `renderToStaticMarkup` já basta para provar
 * que a árvore monta, e não exige dependência nova.
 */
describe('Button', () => {
  it('aceita asChild com ícone e texto dentro do filho', () => {
    const marcacao = renderToStaticMarkup(
      createElement(
        Button,
        { asChild: true },
        createElement('a', { href: '/' }, createElement('svg'), 'Semana'),
      ),
    );

    expect(marcacao).toContain('<a');
    expect(marcacao).toContain('Semana');
  });

  it('mantém o spinner quando é botão de verdade', () => {
    const marcacao = renderToStaticMarkup(
      createElement(Button, { loading: true }, 'Salvando'),
    );

    expect(marcacao).toContain('animate-spin');
    expect(marcacao).toContain('aria-busy');
  });

  it('não mostra spinner sem loading', () => {
    const marcacao = renderToStaticMarkup(createElement(Button, {}, 'Salvar'));

    expect(marcacao).not.toContain('animate-spin');
  });
});
