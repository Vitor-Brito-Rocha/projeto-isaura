import { choqueInterno, mensagemDeChoque, primeiroChoque, sobrepoe } from './conflito';

const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const aula = (iso: string, horaInicio: string, horaFim: string) => ({
  data: dia(iso),
  horaInicio,
  horaFim,
});
const existente = (iso: string, hi: string, hf: string, cadeira: string) => ({
  ...aula(iso, hi, hf),
  cadeira,
  serieId: 's1',
});

describe('sobrepoe', () => {
  it('pega a sobreposição parcial nos dois sentidos', () => {
    expect(sobrepoe(aula('2026-08-24', '07:00', '07:50'), aula('2026-08-24', '07:30', '08:20'))).toBe(true);
    expect(sobrepoe(aula('2026-08-24', '07:30', '08:20'), aula('2026-08-24', '07:00', '07:50'))).toBe(true);
  });

  it('pega o horário idêntico — o caso que passou batido na tela', () => {
    expect(sobrepoe(aula('2026-08-24', '07:00', '07:50'), aula('2026-08-24', '07:00', '07:50'))).toBe(true);
  });

  it('pega uma aula inteiramente dentro da outra', () => {
    expect(sobrepoe(aula('2026-08-24', '07:00', '09:00'), aula('2026-08-24', '07:30', '08:00'))).toBe(true);
  });

  /**
   * O caso que torna a checagem usável em vez de irritante: ela dá aulas
   * seguidas, e 07:50 encostando em 07:50 é o intervalo normal entre dois
   * tempos, não um conflito.
   */
  it('encostar não é sobrepor', () => {
    expect(sobrepoe(aula('2026-08-24', '07:00', '07:50'), aula('2026-08-24', '07:50', '08:40'))).toBe(false);
  });

  it('mesmo horário em dias diferentes não é choque', () => {
    expect(sobrepoe(aula('2026-08-24', '07:00', '07:50'), aula('2026-08-25', '07:00', '07:50'))).toBe(false);
  });

  /**
   * "09:40" < "10:30" funciona como string por acaso; "9:40" já não. Por isso a
   * comparação passa por `minutos()` e não pelo texto.
   */
  it('compara hora como tempo, não como texto', () => {
    expect(sobrepoe(aula('2026-08-24', '9:40', '10:30'), aula('2026-08-24', '10:00', '11:00'))).toBe(true);
  });
});

describe('primeiroChoque', () => {
  it('acha o choque e diz com qual turma foi', () => {
    const c = primeiroChoque(
      [aula('2026-08-24', '07:00', '07:50')],
      [existente('2026-08-24', '07:00', '07:50', 'Matemática · 8º A')],
    );
    expect(c?.com.cadeira).toBe('Matemática · 8º A');
  });

  /**
   * Uma semanal em conflito produz uma dezena de choques idênticos ao longo da
   * janela. O primeiro POR DATA é o que ela precisa para saber qual mexer —
   * devolver um do meio faria a mensagem apontar para uma data distante sem
   * motivo.
   */
  it('devolve o primeiro por data, não o primeiro da lista', () => {
    const c = primeiroChoque(
      [aula('2026-09-07', '07:00', '07:50'), aula('2026-08-24', '07:00', '07:50')],
      [
        existente('2026-09-07', '07:00', '07:50', 'Ciências · 7º B'),
        existente('2026-08-24', '07:00', '07:50', 'Matemática · 8º A'),
      ],
    );
    expect(c?.com.cadeira).toBe('Matemática · 8º A');
  });

  it('silêncio quando nada bate', () => {
    expect(
      primeiroChoque(
        [aula('2026-08-24', '07:00', '07:50')],
        [existente('2026-08-24', '07:50', '08:40', 'Matemática · 8º A')],
      ),
    ).toBeNull();
  });

  it('sem nada no caminho, não inventa choque', () => {
    expect(primeiroChoque([aula('2026-08-24', '07:00', '07:50')], [])).toBeNull();
  });
});

describe('mensagemDeChoque', () => {
  /**
   * Os três dados juntos, e nenhum deles sobra: sem a turma ela não sabe qual
   * mexer, sem o dia da semana precisa abrir a grade, e sem a data não sabe se
   * é esta semana ou a que vem. Data em DD/MM/YYYY como no resto do produto.
   */
  it('diz a turma, o dia da semana e a data', () => {
    const c = primeiroChoque(
      [aula('2026-08-24', '07:00', '07:50')],
      [existente('2026-08-24', '07:00', '07:50', 'Matemática · 8º A')],
    )!;
    const m = mensagemDeChoque(c);

    expect(m).toContain('Matemática · 8º A');
    expect(m).toContain('segunda');
    expect(m).toContain('24/08/2026');
    expect(m).toContain('07:00–07:50');
  });
});

describe('choqueInterno', () => {
  /**
   * A metade que a checagem contra o banco não enxerga: as ocorrências da série
   * sendo salva ainda não existem. E a checagem de duplicata também não pega,
   * porque as chaves `(dia, horaInicio)` são diferentes.
   */
  it('pega dois horários sobrepostos no mesmo formulário', () => {
    expect(
      choqueInterno([
        { diaSemana: 1, horaInicio: '07:00', horaFim: '08:00' },
        { diaSemana: 1, horaInicio: '07:30', horaFim: '08:30' },
      ]),
    ).not.toBeNull();
  });

  it('deixa passar aulas seguidas no mesmo dia', () => {
    expect(
      choqueInterno([
        { diaSemana: 1, horaInicio: '07:00', horaFim: '07:50' },
        { diaSemana: 1, horaInicio: '07:50', horaFim: '08:40' },
      ]),
    ).toBeNull();
  });

  it('deixa passar o mesmo horário em dias diferentes — é o caso comum', () => {
    expect(
      choqueInterno([
        { diaSemana: 1, horaInicio: '07:00', horaFim: '07:50' },
        { diaSemana: 3, horaInicio: '07:00', horaFim: '07:50' },
      ]),
    ).toBeNull();
  });
});
