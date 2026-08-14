/**
 * Conversão entre hora de parede e instante absoluto, respeitando a timezone de
 * cada professor.
 *
 * Por que não um offset fixo: o sistema é multitenant e o Brasil não tem um fuso
 * só — Acre é UTC−5, Fernando de Noronha UTC−2, e o país já teve horário de
 * verão e pode voltar a ter. Um `TZ_OFFSET_MIN = -180` funciona até o primeiro
 * professor de Rio Branco se cadastrar, e aí falha silenciosamente: o alarme
 * dispara na hora errada sem erro nenhum no log.
 *
 * A grade continua guardada como hora de parede ("07:00") porque é isso que ela
 * lê e edita. Estes helpers derivam o instante absoluto na materialização.
 */

/**
 * Offset da timezone, em minutos, no instante dado (positivo a leste de
 * Greenwich). Funciona formatando o instante na tz e reinterpretando o resultado
 * como se fosse UTC — a diferença é exatamente o offset.
 */
export function offsetMinutos(instante: Date, timezone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23', // sem isso, meia-noite vira "24" em alguns ambientes
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const p: Record<string, string> = {};
  for (const parte of dtf.formatToParts(instante)) {
    if (parte.type !== 'literal') p[parte.type] = parte.value;
  }

  const comoSeFosseUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second),
  );

  // Zera os milissegundos do lado do instante: o formatter não os expõe, então
  // compará-los introduziria um erro de até 999 ms no offset.
  const instanteSemMs = Math.floor(instante.getTime() / 1000) * 1000;
  return (comoSeFosseUtc - instanteSemMs) / 60_000;
}

/**
 * Instante absoluto correspondente a uma hora de parede numa timezone.
 *
 * @param dataIso "YYYY-MM-DD"
 * @param hora    "HH:mm"
 */
export function instanteDeParede(dataIso: string, hora: string, timezone: string): Date {
  const [ano, mes, dia] = dataIso.split('-').map(Number);
  const [h, m] = hora.split(':').map(Number);
  const naive = Date.UTC(ano, mes - 1, dia, h, m);

  // Duas passadas: a primeira usa o offset do palpite, a segunda o offset do
  // resultado. Só divergem nas bordas de horário de verão — onde uma passada só
  // erraria em uma hora. Convergir em duas é suficiente para qualquer tz real.
  const primeira = naive - offsetMinutos(new Date(naive), timezone) * 60_000;
  const segunda = naive - offsetMinutos(new Date(primeira), timezone) * 60_000;
  return new Date(segunda);
}

/** Hora de parede ("HH:mm") de um instante, na timezone dada. */
export function hhmmNaTz(instante: Date, timezone: string): string {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  });
  const p: Record<string, string> = {};
  for (const parte of dtf.formatToParts(instante)) {
    if (parte.type !== 'literal') p[parte.type] = parte.value;
  }
  return `${p.hour}:${p.minute}`;
}

/** Data de parede ("YYYY-MM-DD") de um instante, na timezone dada. */
export function dataIsoNaTz(instante: Date, timezone: string): string {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return dtf.format(instante); // en-CA já formata como YYYY-MM-DD
}

/** Date "apenas data" em UTC — a convenção usada nas colunas `@db.Date`. */
export function dataUTC(dataIso: string): Date {
  return new Date(`${dataIso}T00:00:00.000Z`);
}

/** "YYYY-MM-DD" de uma coluna `@db.Date` (que o Prisma devolve como meia-noite UTC). */
export function isoDeDataUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function somarDias(d: Date, dias: number): Date {
  return new Date(d.getTime() + dias * 86_400_000);
}

/** Meia-noite UTC de hoje — o piso das janelas de materialização. */
export function hojeUTC(agora: Date = new Date()): Date {
  return new Date(
    Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate()),
  );
}

/** Converte "HH:mm" em minutos desde a meia-noite. */
export function minutos(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}
