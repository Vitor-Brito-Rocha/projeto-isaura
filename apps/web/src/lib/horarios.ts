import type { Frequencia, Serie } from './types';

/**
 * Os dias e horários de uma série, do jeito que ela lê na tela.
 *
 * A grade não é adivinhada: quem diz "terça e quinta, 07:00–07:50" é a
 * professora, e é daqui que a materialização gera as ocorrências. O resumo
 * existe porque o cartão da cadeira precisa responder "quando isso acontece?"
 * sem ela abrir nada.
 */

export interface HorarioDia {
  /** 0 = domingo … 6 = sábado, igual ao `getUTCDay()` que a API usa. */
  diaSemana: number;
  horaInicio: string; // "HH:mm"
  horaFim: string;
}

export const DIAS = [
  { n: 0, curto: 'dom', longo: 'domingo' },
  { n: 1, curto: 'seg', longo: 'segunda-feira' },
  { n: 2, curto: 'ter', longo: 'terça-feira' },
  { n: 3, curto: 'qua', longo: 'quarta-feira' },
  { n: 4, curto: 'qui', longo: 'quinta-feira' },
  { n: 5, curto: 'sex', longo: 'sexta-feira' },
  { n: 6, curto: 'sáb', longo: 'sábado' },
] as const;

/**
 * Como a frequência se chama para ela, e o que ela precisa saber antes de
 * escolher.
 *
 * A nota não é enfeite: quinzenal e mensal têm regra de contagem que muda quais
 * datas aparecem na grade, e descobrir isso só quando a aula não aparece é o
 * tipo de surpresa que faz desconfiar do sistema inteiro.
 */
export const FREQUENCIAS: ReadonlyArray<{
  valor: Frequencia;
  rotulo: string;
  nota: string;
}> = [
  { valor: 'SEMANAL', rotulo: 'Toda semana', nota: '' },
  {
    valor: 'QUINZENAL',
    rotulo: 'A cada 15 dias',
    nota: 'A contagem começa na semana da data de início.',
  },
  {
    valor: 'MENSAL',
    rotulo: 'Uma vez por mês',
    nota: 'Gera só a primeira ocorrência do dia escolhido em cada mês.',
  },
  { valor: 'PONTUAL', rotulo: 'Aula única', nota: 'Uma aula só, na data de início.' },
];

export function rotuloFrequencia(f: Frequencia): string {
  return FREQUENCIAS.find((x) => x.valor === f)?.rotulo ?? f;
}

export function notaFrequencia(f: Frequencia): string {
  return FREQUENCIAS.find((x) => x.valor === f)?.nota ?? '';
}

/** "07:30" → 450. Para comparar horas sem cair em ordenação de string. */
export function minutosDe(hhmm: string): number {
  const [h, m] = hhmm.split(':');
  return Number(h) * 60 + Number(m);
}

/**
 * O mesmo "fim depois do início" que a API recusa, checado antes de sair daqui.
 *
 * Não substitui a validação do servidor — duplica de propósito, para o erro
 * aparecer enquanto ela olha o campo em vez de depois do salvar.
 */
export function faixaInvalida(horaInicio: string, horaFim: string): boolean {
  return minutosDe(horaFim) <= minutosDe(horaInicio);
}

/** "seg, ter e qui" — a vírgula até o penúltimo, "e" no último. */
export function juntarDias(dias: number[]): string {
  const nomes = [...dias]
    .sort((a, b) => a - b)
    .map((d) => DIAS.find((x) => x.n === d)?.curto ?? '?');
  if (nomes.length <= 1) return nomes.join('');
  return `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
}

/**
 * "ter e qui · 07:00–07:50", ou uma faixa por grupo quando os horários diferem.
 *
 * Agrupa por faixa em vez de listar dia a dia porque o caso comum é a mesma hora
 * em todos os dias — "ter 07:00–07:50 · qui 07:00–07:50" faz ela ler duas vezes
 * para concluir que é a mesma coisa.
 */
export function resumoHorarios(horarios: HorarioDia[]): string {
  if (horarios.length === 0) return 'sem dia definido';

  const porFaixa = new Map<string, number[]>();
  for (const h of horarios) {
    const faixa = `${h.horaInicio}–${h.horaFim}`;
    porFaixa.set(faixa, [...(porFaixa.get(faixa) ?? []), h.diaSemana]);
  }

  return [...porFaixa.entries()]
    .sort((a, b) => Math.min(...a[1]) - Math.min(...b[1]))
    .map(([faixa, dias]) => `${juntarDias(dias)} · ${faixa}`)
    .join('  ·  ');
}

// ---- O formulário de série, do lado de cá ----

/** Primeiro horário oferecido. Ela troca em dois toques; começar vazio custa mais. */
export const FAIXA_PADRAO = { horaInicio: '07:00', horaFim: '07:50' };

export interface RascunhoSerie {
  frequencia: Frequencia;
  dataInicio: string; // "YYYY-MM-DD"
  dataFim: string; // '' = sem fim
  /** Dia da semana → faixa. Só os dias marcados existem aqui. */
  dias: Record<number, { horaInicio: string; horaFim: string }>;
}

/**
 * "Hoje" no relógio dela, não em UTC.
 *
 * `toISOString().slice(0,10)` daria o dia seguinte a partir das 21h no Brasil —
 * e o campo abriria numa data que ela não escolheu.
 */
export function hojeIso(agora = new Date()): string {
  const mes = String(agora.getMonth() + 1).padStart(2, '0');
  const dia = String(agora.getDate()).padStart(2, '0');
  return `${agora.getFullYear()}-${mes}-${dia}`;
}

/**
 * O dia da semana de "YYYY-MM-DD", lido como data pura.
 *
 * Em UTC de propósito: é o mesmo `getUTCDay()` que a API aplica sobre a coluna
 * `@db.Date`. Ler no fuso local devolveria o dia anterior à noite, e a aula
 * única cairia numa segunda quando ela marcou terça.
 */
export function diaSemanaDe(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

export function rascunhoSerieNovo(hoje = hojeIso()): RascunhoSerie {
  return { frequencia: 'SEMANAL', dataInicio: hoje, dataFim: '', dias: {} };
}

export function rascunhoSerieDe(serie: Serie): RascunhoSerie {
  const dias: RascunhoSerie['dias'] = {};
  for (const h of serie.horarios) {
    dias[h.diaSemana] = { horaInicio: h.horaInicio, horaFim: h.horaFim };
  }
  return {
    frequencia: serie.frequencia,
    dataInicio: serie.dataInicio.slice(0, 10),
    dataFim: serie.dataFim?.slice(0, 10) ?? '',
    dias,
  };
}

/**
 * Converte o rascunho no `horarios[]` que a API recebe.
 *
 * Aula única não tem "dia da semana" para ela escolher — o dia é a data que ela
 * marcou. Perguntar as duas coisas deixaria as respostas se contradizerem, e
 * quem perde é a `RecorrenciaService`: para PONTUAL ela procura o horário do dia
 * da data e, não achando, usa o primeiro da lista — a aula apareceria com o
 * horário de outro dia.
 */
export function horariosDoRascunho(r: RascunhoSerie): HorarioDia[] {
  if (r.frequencia === 'PONTUAL') {
    const faixa = Object.values(r.dias)[0] ?? FAIXA_PADRAO;
    return [{ diaSemana: diaSemanaDe(r.dataInicio), ...faixa }];
  }
  return Object.entries(r.dias)
    .map(([dia, faixa]) => ({ diaSemana: Number(dia), ...faixa }))
    .sort((a, b) => a.diaSemana - b.diaSemana);
}
