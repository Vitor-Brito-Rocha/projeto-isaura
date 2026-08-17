import {
  calcularRitmo,
  percentual,
  progressoDasUnidades,
  unidadeAtual,
  type UnidadeDoPlano,
} from './calcular';

const topico = (id: string) => ({ id, titulo: `Tópico ${id}` });

const PLANO: UnidadeDoPlano[] = [
  {
    id: 'u1',
    ordem: 1,
    titulo: 'Números racionais',
    dataFimPrevista: '2026-09-30',
    topicos: [topico('t1'), topico('t2'), topico('t3')],
  },
  {
    id: 'u2',
    ordem: 2,
    titulo: 'Álgebra',
    dataFimPrevista: '2026-11-30',
    topicos: [topico('t4'), topico('t5')],
  },
];

describe('progressoDasUnidades', () => {
  it('conta o que foi coberto e lista o que falta, na ordem do plano', () => {
    const [u1] = progressoDasUnidades(PLANO, new Set(['t1', 't3']));

    expect(u1.cobertos).toBe(2);
    expect(u1.total).toBe(3);
    expect(u1.faltando.map((t) => t.id)).toEqual(['t2']);
    expect(u1.concluida).toBe(false);
  });

  it('unidade com todos os tópicos cobertos está concluída', () => {
    const [, u2] = progressoDasUnidades(PLANO, new Set(['t4', 't5']));
    expect(u2.concluida).toBe(true);
    expect(u2.faltando).toEqual([]);
  });

  it('tópico de outra unidade não conta aqui', () => {
    // O Set vem de todos os registros da cadeira; sem o filtro por unidade, dar
    // um tópico de álgebra adiantaria a barra de números racionais.
    const [u1] = progressoDasUnidades(PLANO, new Set(['t4', 't5']));
    expect(u1.cobertos).toBe(0);
  });

  it('unidade sem tópico nenhum não é "concluída"', () => {
    // Não há o que concluir. Marcá-la como pronta faria o plano inteiro
    // parecer terminado só porque ela criou a unidade e não detalhou.
    const vazia: UnidadeDoPlano[] = [
      { id: 'u9', ordem: 1, titulo: 'Sem tópicos', dataFimPrevista: null, topicos: [] },
    ];
    expect(progressoDasUnidades(vazia, new Set())[0].concluida).toBe(false);
  });
});

describe('unidadeAtual', () => {
  it('é a primeira que ainda tem tópico faltando', () => {
    const us = progressoDasUnidades(PLANO, new Set(['t1']));
    expect(unidadeAtual(us)?.id).toBe('u1');
  });

  it('anda para a seguinte quando a anterior fecha', () => {
    const us = progressoDasUnidades(PLANO, new Set(['t1', 't2', 't3']));
    expect(unidadeAtual(us)?.id).toBe('u2');
  });

  it('segue a ORDEM do plano, não a última aula dada', () => {
    // Ela deu uma aula avulsa da unidade 2 antes de fechar a 1. O que falta
    // continua sendo a 1, e é isso que ela precisa ver.
    const us = progressoDasUnidades(PLANO, new Set(['t4', 't5']));
    expect(unidadeAtual(us)?.id).toBe('u1');
  });

  it('null quando o plano inteiro está coberto', () => {
    const us = progressoDasUnidades(PLANO, new Set(['t1', 't2', 't3', 't4', 't5']));
    expect(unidadeAtual(us)).toBeNull();
  });
});

describe('calcularRitmo', () => {
  const comFaltando = (cobertos: string[]) =>
    unidadeAtual(progressoDasUnidades(PLANO, new Set(cobertos)));

  it('conta só as aulas até a data prevista da unidade', () => {
    const r = calcularRitmo(comFaltando(['t1']), [
      '2026-09-10',
      '2026-09-20',
      '2026-10-05', // depois do fim previsto: não conta
    ]);

    expect(r).toEqual({
      topicosFaltando: 2,
      aulasAte: 2,
      dataFimPrevista: '2026-09-30',
      apertado: false,
    });
  });

  it('empate não é apertado — 2 tópicos em 2 aulas fecha', () => {
    expect(calcularRitmo(comFaltando(['t1']), ['2026-09-10', '2026-09-20'])?.apertado).toBe(false);
  });

  it('menos aula que tópico é apertado', () => {
    expect(calcularRitmo(comFaltando(['t1']), ['2026-09-10'])?.apertado).toBe(true);
  });

  it('nenhuma aula até o prazo é o caso mais gritante', () => {
    const r = calcularRitmo(comFaltando(['t1']), ['2026-12-01']);
    expect(r?.aulasAte).toBe(0);
    expect(r?.apertado).toBe(true);
  });

  it('sem data prevista não há aviso — inventar prazo é pior que não avisar', () => {
    const semData: UnidadeDoPlano[] = [
      { ...PLANO[0], dataFimPrevista: null },
    ];
    const u = unidadeAtual(progressoDasUnidades(semData, new Set()));
    expect(calcularRitmo(u, ['2026-09-10'])).toBeNull();
  });

  it('sem unidade atual não há aviso', () => {
    expect(calcularRitmo(null, ['2026-09-10'])).toBeNull();
  });

  it('a data limite entra na conta (aula no próprio dia vale)', () => {
    expect(calcularRitmo(comFaltando(['t1', 't2']), ['2026-09-30'])?.aulasAte).toBe(1);
  });
});

describe('percentual', () => {
  it('arredonda', () => {
    expect(percentual(1, 3)).toBe(33);
    expect(percentual(2, 3)).toBe(67);
  });

  it('null sem denominador, em vez de dividir por zero', () => {
    // Cadeira sem plano vinculado. A tela mostra convite para vincular, não
    // uma barra vazia que parece atraso.
    expect(percentual(0, 0)).toBeNull();
  });
});
