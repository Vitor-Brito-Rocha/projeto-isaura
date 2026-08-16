import {
  diaSemanaDe,
  faixaInvalida,
  hojeIso,
  horariosDoRascunho,
  juntarDias,
  minutosDe,
  rascunhoSerieDe,
  rascunhoSerieNovo,
  resumoHorarios,
} from './horarios';
import type { Serie } from './types';

describe('minutosDe', () => {
  it('converte para minutos do dia', () => {
    expect(minutosDe('00:00')).toBe(0);
    expect(minutosDe('07:30')).toBe(450);
    expect(minutosDe('23:59')).toBe(1439);
  });

  it('ordena horas que a comparação de string erraria', () => {
    // "09:00" > "10:00" como string; como minuto, não.
    expect(minutosDe('09:00')).toBeLessThan(minutosDe('10:00'));
  });
});

describe('faixaInvalida', () => {
  it('aceita fim depois do início', () => {
    expect(faixaInvalida('07:00', '07:50')).toBe(false);
  });

  it('recusa fim igual ou antes do início — a API recusa igual', () => {
    expect(faixaInvalida('07:00', '07:00')).toBe(true);
    expect(faixaInvalida('08:00', '07:50')).toBe(true);
  });
});

describe('juntarDias', () => {
  it('usa "e" antes do último', () => {
    expect(juntarDias([2, 4])).toBe('ter e qui');
    expect(juntarDias([1, 3, 5])).toBe('seg, qua e sex');
  });

  it('não inventa conector para um dia só', () => {
    expect(juntarDias([3])).toBe('qua');
  });

  it('ordena, venha na ordem que vier', () => {
    expect(juntarDias([5, 1, 3])).toBe('seg, qua e sex');
  });
});

describe('resumoHorarios', () => {
  it('junta os dias quando a faixa é a mesma', () => {
    expect(
      resumoHorarios([
        { diaSemana: 2, horaInicio: '07:00', horaFim: '07:50' },
        { diaSemana: 4, horaInicio: '07:00', horaFim: '07:50' },
      ]),
    ).toBe('ter e qui · 07:00–07:50');
  });

  it('separa quando os horários diferem, na ordem dos dias', () => {
    expect(
      resumoHorarios([
        { diaSemana: 4, horaInicio: '09:00', horaFim: '09:50' },
        { diaSemana: 1, horaInicio: '07:00', horaFim: '07:50' },
      ]),
    ).toBe('seg · 07:00–07:50  ·  qui · 09:00–09:50');
  });

  it('avisa em vez de devolver vazio quando não há dia', () => {
    // Série sem horário não gera aula nenhuma; um resumo em branco no cartão
    // pareceria carregamento.
    expect(resumoHorarios([])).toBe('sem dia definido');
  });
});

describe('hojeIso', () => {
  it('usa o relógio dela, não UTC', () => {
    // 15/08 às 22h em São Paulo já é 16/08 em UTC. `toISOString()` abriria o
    // campo no dia seguinte ao que ela está vendo no relógio.
    const noite = new Date(2026, 7, 15, 22, 30);
    expect(hojeIso(noite)).toBe('2026-08-15');
  });

  it('preenche com zero à esquerda', () => {
    expect(hojeIso(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('diaSemanaDe', () => {
  it('lê a data pura em UTC, como a API', () => {
    // 2026-08-18 é uma terça-feira.
    expect(diaSemanaDe('2026-08-18')).toBe(2);
    expect(diaSemanaDe('2026-08-16')).toBe(0);
  });
});

describe('horariosDoRascunho', () => {
  it('manda os dias marcados, em ordem', () => {
    const r = rascunhoSerieNovo('2026-08-17');
    r.dias = {
      4: { horaInicio: '09:00', horaFim: '09:50' },
      2: { horaInicio: '07:00', horaFim: '07:50' },
    };

    expect(horariosDoRascunho(r)).toEqual([
      { diaSemana: 2, horaInicio: '07:00', horaFim: '07:50' },
      { diaSemana: 4, horaInicio: '09:00', horaFim: '09:50' },
    ]);
  });

  it('na aula única, o dia vem da data escolhida', () => {
    // A tela esconde os botões de dia quando é PONTUAL: o dia É a data. Se
    // este cálculo divergir, a `RecorrenciaService` não acha o horário do dia
    // e usa o primeiro da lista — a aula nasce no horário de outro dia.
    const r = rascunhoSerieNovo('2026-08-19'); // uma quarta-feira
    r.frequencia = 'PONTUAL';
    r.dias = { 6: { horaInicio: '10:00', horaFim: '11:00' } };

    expect(horariosDoRascunho(r)).toEqual([
      { diaSemana: 3, horaInicio: '10:00', horaFim: '11:00' },
    ]);
  });

  it('aula única sem faixa escolhida cai no padrão', () => {
    const r = rascunhoSerieNovo('2026-08-19');
    r.frequencia = 'PONTUAL';

    expect(horariosDoRascunho(r)).toEqual([
      { diaSemana: 3, horaInicio: '07:00', horaFim: '07:50' },
    ]);
  });
});

describe('rascunhoSerieDe', () => {
  const serie = {
    id: 's1',
    cadeiraId: 'c1',
    frequencia: 'QUINZENAL',
    dataInicio: '2026-08-06T00:00:00.000Z',
    dataFim: null,
    ativo: true,
    horarios: [
      { id: 'h1', diaSemana: 4, horaInicio: '07:00', horaFim: '07:50' },
      { id: 'h2', diaSemana: 2, horaInicio: '07:00', horaFim: '07:50' },
    ],
    cadeira: { id: 'c1', disciplina: 'Matemática', turma: '8º A', corHex: '#000' },
  } satisfies Serie;

  it('corta o instante da data para o formato do campo', () => {
    // `<input type="date">` recusa em silêncio qualquer coisa que não seja
    // "YYYY-MM-DD": o campo abre em branco e ela não sabe por quê.
    expect(rascunhoSerieDe(serie).dataInicio).toBe('2026-08-06');
  });

  it('sem data de fim, o campo fica vazio e não vira "null"', () => {
    expect(rascunhoSerieDe(serie).dataFim).toBe('');
  });

  it('a ida e volta preserva os horários', () => {
    expect(horariosDoRascunho(rascunhoSerieDe(serie))).toEqual([
      { diaSemana: 2, horaInicio: '07:00', horaFim: '07:50' },
      { diaSemana: 4, horaInicio: '07:00', horaFim: '07:50' },
    ]);
  });
});
