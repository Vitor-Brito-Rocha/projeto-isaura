import { CANAL_ROTA, destinoDaMensagem } from './rota-notificacao';

describe('destinoDaMensagem', () => {
  it('aceita o caminho da aula que o alarme mandou', () => {
    expect(
      destinoDaMensagem({ tipo: CANAL_ROTA, url: '/aula?ocorrencia=abc&momento=abertura' }),
    ).toBe('/aula?ocorrencia=abc&momento=abertura');
  });

  it('ignora mensagem de outro assunto', () => {
    // A página escuta TODAS as mensagens do service worker. Uma futura
    // (sincronização, atualização disponível) não pode virar navegação.
    expect(destinoDaMensagem({ tipo: 'sincronizou', url: '/aula?ocorrencia=abc' })).toBeNull();
  });

  it('ignora o que não é mensagem', () => {
    expect(destinoDaMensagem(null)).toBeNull();
    expect(destinoDaMensagem('ir-para')).toBeNull();
    expect(destinoDaMensagem({ tipo: CANAL_ROTA })).toBeNull();
    expect(destinoDaMensagem({ tipo: CANAL_ROTA, url: 42 })).toBeNull();
  });

  it('recusa destino fora da própria origem', () => {
    // Isto navega sem clique dela. Endereço absoluto aqui seria a sessão indo
    // junto para outro site.
    expect(destinoDaMensagem({ tipo: CANAL_ROTA, url: 'https://outro.com/aula' })).toBeNull();
    expect(destinoDaMensagem({ tipo: CANAL_ROTA, url: '//outro.com/aula' })).toBeNull();
    expect(destinoDaMensagem({ tipo: CANAL_ROTA, url: 'javascript:alert(1)' })).toBeNull();
  });
});
