import { decodificarHorario, decodificarHorarios } from './unifor-horarios';

describe('decodificarHorario', () => {
  it('lê o código do plano de exemplo', () => {
    // `M3EF` = manhã, terça, tempos E e F. Confirmado contra o cronograma
    // daquele plano, que tem 19 terças para este código e 19 quintas para o par.
    expect(decodificarHorario('M3EF')).toEqual({
      diaSemana: 2,
      horaInicio: '11:20',
      horaFim: '13:00',
      tempos: ['E', 'F'],
    });
  });

  it('o dígito é dia da semana, não número do tempo', () => {
    // A leitura errada custaria a aula: o alarme tocaria no dia errado e nada
    // na grade denunciaria — a linha existe, só está no dia que não é.
    expect(decodificarHorario('M5EF')?.diaSemana).toBe(4); // quinta
    expect(decodificarHorario('M2AB')?.diaSemana).toBe(1); // segunda
    expect(decodificarHorario('M6AB')?.diaSemana).toBe(5); // sexta
  });

  it('cada turno tem sua tabela de horas', () => {
    expect(decodificarHorario('T3AB')).toMatchObject({ horaInicio: '13:30', horaFim: '15:10' });
    expect(decodificarHorario('N3AB')).toMatchObject({ horaInicio: '19:00', horaFim: '20:40' });
    expect(decodificarHorario('M3CD')).toMatchObject({ horaInicio: '09:30', horaFim: '11:10' });
  });

  it('um tempo só dura 50 minutos', () => {
    expect(decodificarHorario('M3A')).toMatchObject({ horaInicio: '07:30', horaFim: '08:20' });
  });

  it('a noite não tem bloco E/F', () => {
    // Não existe na tabela da Unifor. Completar com hora inventada poria a aula
    // depois das 22:40, num horário que não existe.
    expect(decodificarHorario('N3EF')).toBeNull();
    expect(decodificarHorario('N3E')).toBeNull();
  });

  it('letras com buraco no meio são recusadas', () => {
    // `A` é 7:30 e `F` é 12:10. Juntá-las num bloco de 7:30 às 13:00 marcaria
    // como aula as quatro horas de intervalo — e o alarme de fechamento cairia
    // no fim de um período em que ela não estava em sala.
    expect(decodificarHorario('M3AF')).toBeNull();
    expect(decodificarHorario('M3AD')).toBeNull();
  });

  it('recusa o que não reconhece em vez de chutar', () => {
    for (const codigo of ['', 'J16', 'M8AB', 'X3AB', 'M3', 'M3Z', '3EF']) {
      expect(decodificarHorario(codigo)).toBeNull();
    }
  });
});

describe('decodificarHorarios', () => {
  it('lê o campo inteiro do plano de exemplo', () => {
    const r = decodificarHorarios('M3EF (30), M5EF (31)');

    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ diaSemana: 2, horaInicio: '11:20', turma: '30' });
    expect(r[1]).toMatchObject({ diaSemana: 4, horaInicio: '11:20', turma: '31' });
  });

  it('dois códigos são dois HORÁRIOS, não duas turmas', () => {
    // A regra que decide a forma no banco: uma `SerieAula` com dois
    // `SerieHorario`, nunca duas cadeiras. Duas cadeiras partiriam o progresso
    // da turma ao meio e fariam os dois alarmes tocarem em duplicata, e a grade
    // ficaria com a mesma cara na tela.
    const r = decodificarHorarios('M3EF (30), M5EF (31)');

    expect(new Set(r.map((h) => h.diaSemana))).toEqual(new Set([2, 4]));
    expect(new Set(r.map((h) => `${h.horaInicio}-${h.horaFim}`))).toEqual(new Set(['11:20-13:00']));
  });

  it('turma é opcional', () => {
    expect(decodificarHorarios('M3EF')).toEqual([
      { diaSemana: 2, horaInicio: '11:20', horaFim: '13:00', tempos: ['E', 'F'], codigo: 'M3EF', turma: null },
    ]);
  });

  it('código ilegível some, e os outros ficam', () => {
    // Sem isto, um campo com uma sujeira derrubaria a grade inteira — e o que
    // ela veria é a importação "não trazendo horário nenhum".
    expect(decodificarHorarios('M3EF (30), ???, M5EF (31)')).toHaveLength(2);
  });

  it('campo vazio não inventa horário', () => {
    expect(decodificarHorarios('')).toEqual([]);
    expect(decodificarHorarios('-')).toEqual([]);
  });
});
