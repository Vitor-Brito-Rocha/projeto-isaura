import { dataBR, diaDaSemanaBR, diaEDataBR, paraCampoDeData } from './datas';

/**
 * O bug que estes testes travam já esteve em produção: a grade mostrava 14/08
 * para a aula do dia 15, para qualquer professor a oeste de Greenwich — o
 * Brasil inteiro. Um dia puro formatado no fuso local recua uma data.
 */
describe('dataBR', () => {
  it('formata dia puro em DD/MM/YYYY', () => {
    expect(dataBR('2026-04-17T00:00:00.000Z')).toBe('17/04/2026');
  });

  it('aceita "YYYY-MM-DD" sem hora, como vem do campo de data', () => {
    expect(dataBR('2026-04-17')).toBe('17/04/2026');
  });

  it('não recua um dia por causa do fuso', () => {
    // Meia-noite UTC é 21h do dia ANTERIOR em Brasília. Sem `timeZone: 'UTC'`,
    // esta data viraria 31/12/2025.
    expect(dataBR('2026-01-01T00:00:00.000Z')).toBe('01/01/2026');
  });

  it('leva o ano junto', () => {
    // Ela registra aula atrasada e consulta semestre passado: "17/04" sozinho
    // obriga a adivinhar de qual ano é.
    expect(dataBR('2025-04-17T00:00:00.000Z')).toBe('17/04/2025');
  });
});

describe('diaDaSemanaBR', () => {
  it('não deixa o ponto da abreviação passar', () => {
    // O CLDR manda "sex."; builds de ICU divergem. Sem cortar, a mesma tela
    // sairia "sex., 17/04" num navegador e "sex, 17/04" no outro.
    expect(diaDaSemanaBR('2026-04-17T00:00:00.000Z')).toBe('sex');
  });
});

describe('diaEDataBR', () => {
  it('junta dia da semana e data', () => {
    // 2026-04-17 é uma sexta-feira.
    expect(diaEDataBR('2026-04-17T00:00:00.000Z')).toBe('sex, 17/04/2026');
  });
});

describe('paraCampoDeData', () => {
  it('corta o instante para o que o input type=date aceita', () => {
    expect(paraCampoDeData('2026-04-17T00:00:00.000Z')).toBe('2026-04-17');
  });

  it('nulo vira string vazia, não "null"', () => {
    // O campo é controlado: undefined aqui tornaria o input não-controlado no
    // meio do preenchimento.
    expect(paraCampoDeData(null)).toBe('');
    expect(paraCampoDeData(undefined)).toBe('');
  });
});
