/**
 * O código de horário da Unifor: `M3EF` é terça, 11:20 às 13:00.
 *
 * Três pedaços, e cada um vem de uma convenção diferente:
 *
 * - **turno** `M`/`T`/`N` — decide a tabela de horas;
 * - **dígito** — dia da semana na notação brasileira, em que a semana começa no
 *   domingo com 1. Não é o dia do mês nem o número do tempo, que foi a primeira
 *   leitura errada: `M3EF` é terça, e o cronograma daquele plano tem exatamente
 *   19 terças e 19 quintas para `M3EF`/`M5EF`, que é o que confirmou a leitura;
 * - **letras** — tempos de 50 minutos, aos pares (`A/B`, `C/D`, `E/F`).
 *
 * Vale a pena decodificar em vez de pedir na tela porque é o dado que faz o
 * alarme tocar na hora certa, e digitá-lo à mão para onze cadeiras é onde o erro
 * de um dígito passa despercebido até a aula ser perdida.
 */

/** Início de cada tempo, por turno. O fim é 50 minutos depois. */
const INICIO: Record<string, Record<string, string>> = {
  M: { A: '07:30', B: '08:20', C: '09:30', D: '10:20', E: '11:20', F: '12:10' },
  T: { A: '13:30', B: '14:20', C: '15:30', D: '16:20', E: '17:20', F: '18:10' },
  // A noite tem só dois blocos: não existe `E`/`F` depois das 22:40. Um `N3EF`
  // é código inválido, e é por isso que a tabela é incompleta de propósito —
  // completar com um horário inventado poria a aula numa hora que não existe.
  N: { A: '19:00', B: '19:50', C: '21:00', D: '21:50' },
};

const DURACAO_MIN = 50;

export interface HorarioDecodificado {
  /** 0=domingo … 6=sábado, como em `SerieHorario.diaSemana`. */
  diaSemana: number;
  horaInicio: string;
  horaFim: string;
  /** As letras que foram lidas, na ordem. Serve para a tela mostrar o código. */
  tempos: string[];
}

function somarMinutos(hhmm: string, min: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = h * 60 + m + min;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * `M3EF` → terça, 11:20–13:00. Devolve `null` para o que não reconhece.
 *
 * **Letras consecutivas viram UM encontro, não dois.** `E+F` é uma aula de
 * 11:20 às 13:00 porque é uma aula que ela dá e uma que ela registra — dois
 * tempos separados dariam dois alarmes de abertura com dez minutos de intervalo.
 * É a mesma leitura de "encostar não é sobrepor" que o `series/conflito.ts` usa
 * para não acusar choque entre 07:00–07:50 e 07:50–08:40.
 *
 * Letras com buraco no meio (`M3AF`, que seria 7:30 e 12:10) NÃO viram um bloco
 * de 7:30 às 13:00: são dois encontros distintos no mesmo dia, e juntá-los
 * marcaria como aula as quatro horas de intervalo. Recusa, e a tela pede à mão.
 */
export function decodificarHorario(codigo: string): HorarioDecodificado | null {
  const casa = /^([MTN])([1-7])([A-F]+)$/i.exec(codigo.trim());
  if (!casa) return null;

  const turno = casa[1].toUpperCase();
  // Notação brasileira: 1=domingo … 7=sábado. O `SerieHorario` conta de 0.
  const diaSemana = Number(casa[2]) - 1;
  const tempos = [...new Set(casa[3].toUpperCase().split(''))];

  const inicios = tempos.map((t) => INICIO[turno]?.[t]);
  if (inicios.some((i) => i === undefined)) return null;

  const ordenados = [...(inicios as string[])].sort();
  for (let i = 1; i < ordenados.length; i++) {
    if (somarMinutos(ordenados[i - 1], DURACAO_MIN) !== ordenados[i]) return null;
  }

  return {
    diaSemana,
    horaInicio: ordenados[0],
    horaFim: somarMinutos(ordenados[ordenados.length - 1], DURACAO_MIN),
    tempos: tempos.sort(),
  };
}

export interface HorarioDaTurma extends HorarioDecodificado {
  /** O `(30)` de `M3EF (30)`. Null quando o documento não anota a turma. */
  turma: string | null;
  codigo: string;
}

/**
 * Lê o campo `Horário (Turma)` inteiro: `M3EF (30), M5EF (31)`.
 *
 * Devolve um horário por código, e **não uma turma por código** — é a diferença
 * que decide a forma no banco. Os dois códigos daquele plano são a mesma turma
 * encontrando duas vezes por semana (a conta fecha: 4 tempos × 18 semanas = as
 * 72 h/a que a ementa declara), então viram uma `SerieAula` com dois
 * `SerieHorario`. Duas cadeiras partiriam o progresso da turma ao meio e
 * disparariam o alarme em duplicata, sem nada na tela denunciando.
 */
export function decodificarHorarios(campo: string): HorarioDaTurma[] {
  const saida: HorarioDaTurma[] = [];

  for (const parte of campo.split(',')) {
    const casa = /^\s*([A-Za-z0-9]+)\s*(?:\(([^)]*)\))?\s*$/.exec(parte);
    if (!casa) continue;

    const horario = decodificarHorario(casa[1]);
    if (!horario) continue;

    saida.push({ ...horario, codigo: casa[1].toUpperCase(), turma: casa[2]?.trim() || null });
  }

  return saida;
}
