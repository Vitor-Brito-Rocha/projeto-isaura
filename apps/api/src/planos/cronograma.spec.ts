import { estimarCronograma } from './cronograma';

/** As 37 datas do plano de exemplo, terças e quintas de 04/08 a 10/12. */
const ENCONTROS = [
  '2026-08-04', '2026-08-06', '2026-08-11', '2026-08-13', '2026-08-18', '2026-08-20',
  '2026-08-25', '2026-08-27', '2026-09-01', '2026-09-03', '2026-09-08', '2026-09-10',
  '2026-09-15', '2026-09-17', '2026-09-22', '2026-09-24', '2026-09-29', '2026-10-01',
  '2026-10-06', '2026-10-08', '2026-10-15', '2026-10-20', '2026-10-22', '2026-10-27',
  '2026-10-29', '2026-11-03', '2026-11-05', '2026-11-10', '2026-11-12', '2026-11-17',
  '2026-11-19', '2026-11-24', '2026-11-26', '2026-12-01', '2026-12-03', '2026-12-08',
  '2026-12-10',
];

const UNIDADES = [
  { ordem: 1, cargaHoraria: 6 },
  { ordem: 2, cargaHoraria: 12 },
  { ordem: 3, cargaHoraria: 30 },
  { ordem: 4, cargaHoraria: 24 },
];

describe('estimarCronograma', () => {
  it('divide o semestre do plano de exemplo na proporção das horas-aula', () => {
    expect(estimarCronograma(UNIDADES, ENCONTROS)).toEqual([
      { ordem: 1, aulas: 3, dataInicio: '2026-08-04', dataFimPrevista: '2026-08-11' },
      { ordem: 2, aulas: 6, dataInicio: '2026-08-13', dataFimPrevista: '2026-09-01' },
      { ordem: 3, aulas: 16, dataInicio: '2026-09-03', dataFimPrevista: '2026-10-29' },
      { ordem: 4, aulas: 12, dataInicio: '2026-11-03', dataFimPrevista: '2026-12-10' },
    ]);
  });

  it('a soma fecha exata, sem sobrar nem faltar aula', () => {
    // É o que o maior resto compra. Arredondando cada parte por conta própria,
    // o erro se acumula na última unidade — que terminaria o semestre num dia
    // que não existe na grade.
    for (const total of [7, 13, 19, 31, 37, 40]) {
      const r = estimarCronograma(UNIDADES, ENCONTROS.slice(0, total));
      expect(r.reduce((s, e) => s + e.aulas, 0)).toBe(Math.min(total, ENCONTROS.length));
    }
  });

  it('as unidades não se sobrepõem e cobrem tudo em ordem', () => {
    const r = estimarCronograma(UNIDADES, ENCONTROS);

    expect(r[0].dataInicio).toBe(ENCONTROS[0]);
    expect(r[r.length - 1].dataFimPrevista).toBe(ENCONTROS[ENCONTROS.length - 1]);
    for (let i = 1; i < r.length; i++) {
      expect(r[i].dataInicio > r[i - 1].dataFimPrevista).toBe(true);
    }
  });

  it('sem carga horária declarada, divide em partes iguais', () => {
    const r = estimarCronograma(
      [1, 2, 3, 4].map((ordem) => ({ ordem, cargaHoraria: null })),
      ENCONTROS.slice(0, 8),
    );

    expect(r.map((e) => e.aulas)).toEqual([2, 2, 2, 2]);
  });

  it('carga declarada pela metade não conta para ninguém', () => {
    // Com peso em umas e zero em outras, as sem declaração ficariam com uma
    // aula só — pior que a divisão igual, que ao menos não finge saber.
    const r = estimarCronograma(
      [
        { ordem: 1, cargaHoraria: 30 },
        { ordem: 2, cargaHoraria: null },
      ],
      ENCONTROS.slice(0, 10),
    );

    expect(r.map((e) => e.aulas)).toEqual([5, 5]);
  });

  it('toda unidade recebe pelo menos uma aula', () => {
    // Unidade com zero aulas não teria data nenhuma e sumiria do aviso de
    // ritmo — justamente a que está mais apertada.
    const r = estimarCronograma(
      [
        { ordem: 1, cargaHoraria: 2 },
        { ordem: 2, cargaHoraria: 2 },
        { ordem: 3, cargaHoraria: 200 },
      ],
      ENCONTROS.slice(0, 5),
    );

    expect(r.map((e) => e.aulas)).toEqual([1, 1, 3]);
  });

  it('não estima quando há menos datas do que unidades', () => {
    // Prazo inventado é pior que nenhum: o aviso de ritmo passa a mentir e ela
    // para de olhar para ele. Mesma regra do `calcularRitmo`, que devolve null.
    expect(estimarCronograma(UNIDADES, ENCONTROS.slice(0, 3))).toEqual([]);
  });

  it('sem datas não inventa prazo', () => {
    expect(estimarCronograma(UNIDADES, [])).toEqual([]);
  });

  it('sem unidades não devolve nada', () => {
    expect(estimarCronograma([], ENCONTROS)).toEqual([]);
  });

  it('data repetida no documento conta uma vez', () => {
    // O plano de exemplo lista 04/08 em duas linhas da tabela. Contá-la duas
    // vezes empurraria todas as unidades um dia para a frente.
    const r = estimarCronograma(UNIDADES, [ENCONTROS[0], ...ENCONTROS]);

    expect(r.reduce((s, e) => s + e.aulas, 0)).toBe(ENCONTROS.length);
  });

  it('não depende da ordem em que as datas chegam', () => {
    const embaralhado = [...ENCONTROS].reverse();

    expect(estimarCronograma(UNIDADES, embaralhado)).toEqual(
      estimarCronograma(UNIDADES, ENCONTROS),
    );
  });
});
