import { escolherProvedor } from './provedor';

/**
 * A regra que decide para QUAL empresa a fala da professora é enviada.
 *
 * Merece teste por isso, e não pela complexidade: o modo de falhar que importa
 * aqui não é erro na tela, é dado indo para um terceiro que ninguém escolheu.
 */
describe('escolherProvedor', () => {
  it('sem chave nenhuma, fica inativo', () => {
    expect(escolherProvedor({})).toBeNull();
  });

  it('sem escolha explícita, Anthropic ganha por ser o alvo do projeto', () => {
    expect(escolherProvedor({ ANTHROPIC_API_KEY: 'sk-x', GROQ_API_KEY: 'gsk-y' })).toBe('anthropic');
  });

  it('sem escolha e só com a chave da Groq, usa a Groq', () => {
    expect(escolherProvedor({ GROQ_API_KEY: 'gsk-y' })).toBe('groq');
  });

  it('IA_PROVEDOR manda mesmo com a outra chave presente', () => {
    expect(
      escolherProvedor({ IA_PROVEDOR: 'groq', ANTHROPIC_API_KEY: 'sk-x', GROQ_API_KEY: 'gsk-y' }),
    ).toBe('groq');
    expect(
      escolherProvedor({
        IA_PROVEDOR: 'anthropic',
        ANTHROPIC_API_KEY: 'sk-x',
        GROQ_API_KEY: 'gsk-y',
      }),
    ).toBe('anthropic');
  });

  it('pedido sem a chave correspondente fica INATIVO, não cai para o outro', () => {
    // O ponto do teste. Cair para o outro mandaria a fala para uma empresa que
    // o usuário não escolheu, e ele descobriria isso lendo log de servidor.
    expect(escolherProvedor({ IA_PROVEDOR: 'groq', ANTHROPIC_API_KEY: 'sk-x' })).toBeNull();
    expect(escolherProvedor({ IA_PROVEDOR: 'anthropic', GROQ_API_KEY: 'gsk-y' })).toBeNull();
  });

  it('chave em branco não conta como configurada', () => {
    // `.env` com a linha presente e valor vazio é o estado normal antes de
    // colar a chave — tratar como configurada daria erro só na hora do uso.
    expect(escolherProvedor({ ANTHROPIC_API_KEY: '   ', GROQ_API_KEY: '' })).toBeNull();
  });

  it('aceita o valor com espaço e caixa alta, como sai de um .env editado à mão', () => {
    expect(escolherProvedor({ IA_PROVEDOR: ' GROQ ', GROQ_API_KEY: 'gsk-y' })).toBe('groq');
  });
});
