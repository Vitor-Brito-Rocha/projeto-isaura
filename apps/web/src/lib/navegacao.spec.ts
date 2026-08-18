import { temTelaAnterior } from './navegacao';

/**
 * O que estes testes protegem: o botão de voltar não sair do app.
 *
 * Um app instalado que executa `history.back()` sem ter para onde voltar mostra
 * tela branca — e a aula que ela acabou de cancelar é justamente a tela que o
 * ALARME abre, sem nada antes dela no histórico.
 */
describe('temTelaAnterior', () => {
  it('não há tela anterior quando o histórico não cresceu', () => {
    // Abriu direto nesta tela: pelo alarme, por um endereço colado, por um
    // atalho na tela de início.
    expect(temTelaAnterior(1, 1)).toBe(false);
    expect(temTelaAnterior(7, 7)).toBe(false);
  });

  it('há tela anterior quando o app empilhou entrada', () => {
    expect(temTelaAnterior(1, 2)).toBe(true);
    expect(temTelaAnterior(3, 9)).toBe(true);
  });

  it('o que já existia antes do app não conta como tela anterior', () => {
    // Ela veio de um link no WhatsApp: o histórico já chega com entrada, e
    // voltar levaria para FORA do app.
    expect(temTelaAnterior(5, 5)).toBe(false);
  });

  it('sem marcação de início, responde "não" — o lado seguro é a home', () => {
    // Só acontece se o `Providers` não tiver montado, o que não deveria
    // ocorrer; ainda assim o desfecho não pode ser sair do app.
    expect(temTelaAnterior(null, 4)).toBe(false);
  });

  it('histórico menor que o inicial também é "não"', () => {
    // O navegador pode podar entradas antigas ao estourar o teto (~50). Menos
    // entrada do que no começo nunca significa que há para onde voltar.
    expect(temTelaAnterior(50, 49)).toBe(false);
  });
});
