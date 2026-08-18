import { isoDeDataUTC, minutos } from '../common/tz';

/**
 * Duas aulas ao mesmo tempo são duas aulas que ela não vai dar.
 *
 * O sistema deixava cadastrar 07:00–07:50 na segunda para três turmas
 * diferentes, e nada reclamava. O estrago não é a linha errada na grade: é que
 * os dois alarmes de abertura tocam no mesmo minuto perguntando "o que você
 * planeja dar?" para turmas diferentes. A tabela de intensidade promete que o
 * alarme significa alguma coisa; dois alarmes contraditórios no mesmo instante
 * é a versão mais rápida de "alarme demais vira alarme nenhum".
 *
 * A comparação é em hora de PAREDE, e isso é seguro aqui — ao contrário do
 * motor de alarmes, os dois lados são do mesmo professor, logo do mesmo fuso.
 * O que não dá para comparar como string é a hora em si: `minutos()` existe
 * porque "09:40" < "10:30" funciona por acaso e "9:40" já não.
 */
export interface AulaComparavel {
  data: Date;
  horaInicio: string;
  horaFim: string;
}

export interface AulaExistente extends AulaComparavel {
  /** Como a turma aparece para ela: "Matemática · 8º A". */
  cadeira: string;
  serieId: string | null;
}

export interface Choque {
  data: Date;
  horaInicio: string;
  horaFim: string;
  com: AulaExistente;
}

/**
 * Encostar não é sobrepor.
 *
 * 07:00–07:50 seguido de 07:50–08:40 é o intervalo normal entre dois tempos, e
 * tratar isso como choque tornaria a checagem inútil justamente para quem tem
 * aulas seguidas — que é o caso dela.
 */
export function sobrepoe(a: AulaComparavel, b: AulaComparavel): boolean {
  if (isoDeDataUTC(a.data) !== isoDeDataUTC(b.data)) return false;
  return minutos(a.horaInicio) < minutos(b.horaFim) && minutos(b.horaInicio) < minutos(a.horaFim);
}

/**
 * O PRIMEIRO choque, não todos.
 *
 * Uma série semanal em conflito produz uma dezena de choques idênticos ao longo
 * da janela, e listar os dez não diz nada além do primeiro. A mensagem que
 * resolve é "choca com tal turma, em tal dia, em tal horário" — com isso ela
 * sabe qual das duas mexer.
 */
export function primeiroChoque(
  candidatas: AulaComparavel[],
  existentes: AulaExistente[],
): Choque | null {
  const ordenadas = [...candidatas].sort(
    (x, y) =>
      x.data.getTime() - y.data.getTime() || minutos(x.horaInicio) - minutos(y.horaInicio),
  );

  for (const c of ordenadas) {
    const bateu = existentes.find((e) => sobrepoe(c, e));
    if (bateu) {
      return { data: c.data, horaInicio: c.horaInicio, horaFim: c.horaFim, com: bateu };
    }
  }
  return null;
}

const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/**
 * A frase que ela lê.
 *
 * Diz a turma, o dia da semana e a data — os três, porque "choca com Ciências"
 * sozinho não diz qual dos horários mexer, e a data sozinha exige abrir a grade
 * para descobrir que dia da semana é.
 */
export function mensagemDeChoque(c: Choque): string {
  const iso = isoDeDataUTC(c.data);
  const [ano, mes, dia] = iso.split('-');
  const diaSemana = DIAS[c.data.getUTCDay()];
  return (
    `Esse horário choca com ${c.com.cadeira}: ${diaSemana}, ${dia}/${mes}/${ano}, ` +
    `${c.com.horaInicio}–${c.com.horaFim}. Ajuste um dos dois — você não pode estar nas duas turmas ao mesmo tempo.`
  );
}

/**
 * Choque DENTRO da mesma série — a metade que a checagem contra o banco não vê.
 *
 * As ocorrências da série sendo salva ainda não existem, então "seg 07:00–08:00"
 * e "seg 07:30–08:30" no mesmo formulário passariam batido e virariam duas
 * aulas sobrepostas já materializadas. A checagem de duplicata não pega: as
 * chaves `(dia, horaInicio)` são diferentes.
 */
export function choqueInterno(
  horarios: { diaSemana: number; horaInicio: string; horaFim: string }[],
): [(typeof horarios)[number], (typeof horarios)[number]] | null {
  for (let i = 0; i < horarios.length; i++) {
    for (let j = i + 1; j < horarios.length; j++) {
      const a = horarios[i];
      const b = horarios[j];
      if (a.diaSemana !== b.diaSemana) continue;
      if (minutos(a.horaInicio) < minutos(b.horaFim) && minutos(b.horaInicio) < minutos(a.horaFim)) {
        return [a, b];
      }
    }
  }
  return null;
}
