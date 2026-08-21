import { levaDoArquivamento } from './arquivamento';

/** A hora exata não importa; o que importa é serem instantes distintos. */
const em = (iso: string) => ({ aberturaNotificadaEm: new Date(iso) });

const ARQUIVOU = '2026-08-21T14:00:00.000Z';

describe('levaDoArquivamento', () => {
  it('devolve as aulas derrubadas no mesmo instante', () => {
    // `desativar` cancela num `updateMany` só, então a leva inteira compartilha
    // o carimbo — é isso que a torna identificável sem coluna nova no banco.
    const leva = [em(ARQUIVOU), em(ARQUIVOU), em(ARQUIVOU)];

    expect(levaDoArquivamento(leva)).toEqual(leva);
  });

  it('deixa de fora a aula que ela cancelou À MÃO antes de arquivar', () => {
    // A regra inteira existe para esta linha. Feriado escolar desmarcado em
    // julho não pode voltar porque ela reativou a turma em agosto: o sintoma
    // seria um alarme tocando num dia sem aula, semanas depois, sem nada na
    // tela ligando uma coisa à outra.
    const feriado = em('2026-07-02T09:13:44.000Z');
    const daLeva = em(ARQUIVOU);

    expect(levaDoArquivamento([feriado, daLeva])).toEqual([daLeva]);
  });

  it('com dois arquivamentos, só o último volta', () => {
    // Arquivar, reativar, arquivar de novo. O que o primeiro derrubou já voltou
    // naquela reativação; devolvê-lo agora desfaria decisão mais nova.
    const antigo = em('2026-03-10T11:00:00.000Z');
    const recente = em(ARQUIVOU);

    expect(levaDoArquivamento([antigo, recente, antigo])).toEqual([recente]);
  });

  it('preserva o resto da linha, não só o carimbo', () => {
    // Quem chama precisa do id para o `updateMany` e da data/hora para a
    // checagem de choque. Uma versão que devolvesse só os carimbos passaria
    // nos testes acima e seria inútil.
    const linha = { id: 'oc-1', horaInicio: '11:20', aberturaNotificadaEm: new Date(ARQUIVOU) };

    expect(levaDoArquivamento([linha])).toEqual([linha]);
  });

  it('lista vazia devolve vazia, e não estoura', () => {
    // `Math.max()` sem argumento é -Infinity, que casaria com nada mas por
    // acidente. O caminho vazio é comum: turma arquivada sem nenhuma aula
    // futura na hora do arquivamento.
    expect(levaDoArquivamento([])).toEqual([]);
  });

  it('ignora quem está sem carimbo em vez de tratá-lo como leva', () => {
    // Aula cancelada por um caminho que não marcou a notificação não é da leva
    // — e um `null` virando 0 no `Math.max` a traria de volta.
    expect(levaDoArquivamento([{ aberturaNotificadaEm: null }])).toEqual([]);
    expect(levaDoArquivamento([{ aberturaNotificadaEm: null }, em(ARQUIVOU)])).toEqual([
      em(ARQUIVOU),
    ]);
  });
});
