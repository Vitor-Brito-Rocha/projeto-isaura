import { PALETA, proximaCor } from './cores';

describe('proximaCor', () => {
  it('a primeira cadeira pega a primeira cor', () => {
    expect(proximaCor([])).toBe(PALETA[0]);
  });

  it('não repete enquanto houver cor livre', () => {
    // É o caso que o calendário expôs: com o `@default` do schema, onze
    // cadeiras nasciam do mesmo azul e os pontos não identificavam nada.
    const usadas: string[] = [];
    for (let i = 0; i < PALETA.length; i += 1) usadas.push(proximaCor(usadas));

    expect(new Set(usadas).size).toBe(PALETA.length);
  });

  it('esgotada a paleta, recomeça pela menos usada', () => {
    const todas = [...PALETA];
    expect(proximaCor(todas)).toBe(PALETA[0]);
    expect(proximaCor([...todas, PALETA[0]])).toBe(PALETA[1]);
  });

  it('ignora cor fora da paleta em vez de engasgar', () => {
    // Ela pode ter escolhido uma cor à mão, ou o dado de teste ter outra.
    expect(proximaCor(['#123456', '#abcdef'])).toBe(PALETA[0]);
  });

  it('compara sem se importar com a caixa do hex', () => {
    expect(proximaCor([PALETA[0].toLowerCase()])).toBe(PALETA[1]);
  });
});
