/**
 * A trava que faz a troca de API existir — ou não existir.
 *
 * `PODE_ALTERNAR` é lida de `process.env.NEXT_PUBLIC_API_ALTERNAVEL`, e o Next
 * INLINA `NEXT_PUBLIC_*` no bundle na hora do build. Ou seja: a decisão é do
 * build, não da execução — pôr a variável no painel da hospedagem depois do
 * deploy não muda nada até sair um build novo.
 *
 * Isto precisa de teste porque a falha é MUDA nos dois sentidos: sem a flag o
 * componente devolve `null` e não sobra nada na tela para dizer por quê, e um
 * "de propósito" que ligasse a troca por engano num build de uso real também
 * passaria despercebido. Foi exatamente o que aconteceu num deploy: a tela subiu
 * inteira, sem erro nenhum, e só faltava o botão.
 *
 * `renderToStaticMarkup` e não testing-library, pelo mesmo motivo do
 * `button.spec.ts`: provar que a árvore monta não exige dependência nova.
 */
function montarNoLogin(flag?: string): string {
  const anterior = process.env.NEXT_PUBLIC_API_ALTERNAVEL;
  if (flag === undefined) delete process.env.NEXT_PUBLIC_API_ALTERNAVEL;
  else process.env.NEXT_PUBLIC_API_ALTERNAVEL = flag;

  // Tudo por `require` DEPOIS do reset, e no mesmo escopo: React guarda o
  // dispatcher de hooks e o contexto do React Query na instância do módulo.
  // Misturar uma cópia nova com o `import` do topo quebraria por "No
  // QueryClient set", que não é o que este teste quer medir.
  jest.resetModules();
  const { createElement } = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const { QueryClient, QueryClientProvider } = require('@tanstack/react-query');
  const { TrocarApiCompacto } = require('./trocar-api');

  try {
    return renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client: new QueryClient() },
        createElement(TrocarApiCompacto),
      ),
    );
  } finally {
    if (anterior === undefined) delete process.env.NEXT_PUBLIC_API_ALTERNAVEL;
    else process.env.NEXT_PUBLIC_API_ALTERNAVEL = anterior;
  }
}

describe('TrocarApiCompacto', () => {
  it('aparece no login quando o build ligou a troca', () => {
    const marcacao = montarNoLogin('1');
    expect(marcacao).toContain('trocar');
    expect(marcacao).toContain('/api');
  });

  it('não existe sem a flag — e é assim que o build de uso real sai', () => {
    expect(montarNoLogin(undefined)).toBe('');
  });

  it('vazio, "0" e "true" não ligam nada: só o "1" exato liga', () => {
    expect(montarNoLogin('')).toBe('');
    expect(montarNoLogin('0')).toBe('');
    expect(montarNoLogin('true')).toBe('');
  });

  /**
   * O laço que este componente existe para cortar: os Ajustes ficam atrás do
   * login. Se o endereço estiver errado ela não entra, e sem entrar não chega na
   * tela que conserta o endereço.
   */
  it('mostra o endereço em uso antes de qualquer clique', () => {
    expect(montarNoLogin('1')).toContain('API:');
  });
});
