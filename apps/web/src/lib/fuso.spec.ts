import { cidadeDoFuso } from './fuso';

describe('cidadeDoFuso', () => {
  it('devolve o nome com acento, e não o identificador', () => {
    // É o caso dela, e o motivo de a função existir.
    expect(cidadeDoFuso('America/Sao_Paulo')).toBe('São Paulo');
  });

  it('acerta os outros fusos brasileiros que perdem acento no IANA', () => {
    expect(cidadeDoFuso('America/Belem')).toBe('Belém');
    expect(cidadeDoFuso('America/Cuiaba')).toBe('Cuiabá');
    expect(cidadeDoFuso('America/Maceio')).toBe('Maceió');
    expect(cidadeDoFuso('America/Araguaina')).toBe('Araguaína');
    // O nome curto do IANA não é como ninguém chama a ilha.
    expect(cidadeDoFuso('America/Noronha')).toBe('Fernando de Noronha');
  });

  it('quem já sai certo pela regra geral não precisa estar na lista', () => {
    // Manter esses num mapa seria uma segunda fonte de verdade para atualizar.
    expect(cidadeDoFuso('America/Fortaleza')).toBe('Fortaleza');
    expect(cidadeDoFuso('America/Manaus')).toBe('Manaus');
    expect(cidadeDoFuso('America/Rio_Branco')).toBe('Rio Branco');
    expect(cidadeDoFuso('America/Campo_Grande')).toBe('Campo Grande');
  });

  it('fuso de três partes usa a última — é a cidade', () => {
    expect(cidadeDoFuso('America/Argentina/Buenos_Aires')).toBe('Buenos Aires');
  });

  it('fuso desconhecido degrada para o último trecho, nunca para vazio', () => {
    // O perfil vem do servidor: um valor que este mapa não conhece não pode
    // apagar a linha da tela, senão ela deixa de saber em que fuso está.
    expect(cidadeDoFuso('Europe/Lisbon')).toBe('Lisbon');
    expect(cidadeDoFuso('UTC')).toBe('UTC');
  });

  it('vazio, nulo e indefinido devolvem string vazia', () => {
    expect(cidadeDoFuso('')).toBe('');
    expect(cidadeDoFuso('   ')).toBe('');
    expect(cidadeDoFuso(null)).toBe('');
    expect(cidadeDoFuso(undefined)).toBe('');
  });
});
