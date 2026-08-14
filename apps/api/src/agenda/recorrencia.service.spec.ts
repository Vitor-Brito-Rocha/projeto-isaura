import { Frequencia } from '@prisma/client';
import { RecorrenciaService } from './recorrencia.service';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const datas = (r: { data: Date }[]) => r.map((x) => x.data.toISOString().slice(0, 10));

describe('RecorrenciaService', () => {
  const servico = new RecorrenciaService();

  // 2026-08-04 é uma terça; 2026-08-06 é uma quinta.
  const terQui = [
    { diaSemana: 2, horaInicio: '07:00', horaFim: '07:50' },
    { diaSemana: 4, horaInicio: '09:00', horaFim: '09:50' },
  ];

  it('SEMANAL gera todos os dias configurados na janela', () => {
    const r = servico.gerar({
      frequencia: Frequencia.SEMANAL,
      dataInicio: d('2026-08-04'),
      dataFim: null,
      horarios: terQui,
      de: d('2026-08-01'),
      ate: d('2026-08-14'),
    });
    expect(datas(r)).toEqual([
      '2026-08-04',
      '2026-08-06',
      '2026-08-11',
      '2026-08-13',
    ]);
  });

  it('carrega o horário certo de cada dia da semana', () => {
    const r = servico.gerar({
      frequencia: Frequencia.SEMANAL,
      dataInicio: d('2026-08-04'),
      dataFim: null,
      horarios: terQui,
      de: d('2026-08-04'),
      ate: d('2026-08-06'),
    });
    expect(r).toEqual([
      { data: d('2026-08-04'), horaInicio: '07:00', horaFim: '07:50' },
      { data: d('2026-08-06'), horaInicio: '09:00', horaFim: '09:50' },
    ]);
  });

  it('QUINZENAL pula uma semana sim, outra não, ancorado na dataInicio', () => {
    const r = servico.gerar({
      frequencia: Frequencia.QUINZENAL,
      dataInicio: d('2026-08-04'),
      dataFim: null,
      horarios: [terQui[0]],
      de: d('2026-08-01'),
      ate: d('2026-09-01'),
    });
    expect(datas(r)).toEqual(['2026-08-04', '2026-08-18', '2026-09-01']);
  });

  it('QUINZENAL mantém a paridade quando a janela começa depois do início', () => {
    // Mesma série do teste anterior, mas olhando só a partir de setembro: a
    // paridade tem de continuar batendo com a âncora, não reiniciar na janela.
    const r = servico.gerar({
      frequencia: Frequencia.QUINZENAL,
      dataInicio: d('2026-08-04'),
      dataFim: null,
      horarios: [terQui[0]],
      de: d('2026-09-02'),
      ate: d('2026-09-30'),
    });
    expect(datas(r)).toEqual(['2026-09-15', '2026-09-29']);
  });

  it('MENSAL pega só a primeira ocorrência do dia no mês', () => {
    const r = servico.gerar({
      frequencia: Frequencia.MENSAL,
      dataInicio: d('2026-08-04'),
      dataFim: null,
      horarios: [terQui[0]],
      de: d('2026-08-01'),
      ate: d('2026-10-31'),
    });
    expect(datas(r)).toEqual(['2026-08-04', '2026-09-01', '2026-10-06']);
  });

  it('PONTUAL gera uma aula só', () => {
    const r = servico.gerar({
      frequencia: Frequencia.PONTUAL,
      dataInicio: d('2026-08-04'),
      dataFim: null,
      horarios: terQui,
      de: d('2026-08-01'),
      ate: d('2026-08-31'),
    });
    expect(r).toEqual([{ data: d('2026-08-04'), horaInicio: '07:00', horaFim: '07:50' }]);
  });

  it('respeita dataFim', () => {
    const r = servico.gerar({
      frequencia: Frequencia.SEMANAL,
      dataInicio: d('2026-08-04'),
      dataFim: d('2026-08-06'),
      horarios: terQui,
      de: d('2026-08-01'),
      ate: d('2026-08-31'),
    });
    expect(datas(r)).toEqual(['2026-08-04', '2026-08-06']);
  });

  it('não gera nada antes da dataInicio', () => {
    const r = servico.gerar({
      frequencia: Frequencia.SEMANAL,
      dataInicio: d('2026-08-11'),
      dataFim: null,
      horarios: terQui,
      de: d('2026-08-01'),
      ate: d('2026-08-12'),
    });
    expect(datas(r)).toEqual(['2026-08-11']);
  });

  it('devolve vazio sem horários', () => {
    const r = servico.gerar({
      frequencia: Frequencia.SEMANAL,
      dataInicio: d('2026-08-04'),
      dataFim: null,
      horarios: [],
      de: d('2026-08-01'),
      ate: d('2026-08-31'),
    });
    expect(r).toEqual([]);
  });

  it('devolve vazio quando a série já terminou antes da janela', () => {
    const r = servico.gerar({
      frequencia: Frequencia.SEMANAL,
      dataInicio: d('2026-01-06'),
      dataFim: d('2026-06-30'),
      horarios: terQui,
      de: d('2026-08-01'),
      ate: d('2026-08-31'),
    });
    expect(r).toEqual([]);
  });
});
