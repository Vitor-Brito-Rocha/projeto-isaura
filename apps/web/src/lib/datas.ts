/**
 * Toda data que aparece em número na tela passa por aqui.
 *
 * Duas regras, e as duas já morderam este projeto:
 *
 * 1. **DD/MM/YYYY, sempre.** O ano não é enfeite: a professora registra aula
 *    atrasada e consulta histórico de outro semestre, então "17/04" sozinho
 *    obriga a adivinhar de qual ano é. E `06/07` é dia 6 de julho ou 7 de
 *    junho, dependendo de quem lê — ambiguidade que num campo de entrega de
 *    tarefa faz a turma inteira entregar na data errada.
 *
 * 2. **`timeZone: 'UTC'` nas datas puras.** `Ocorrencia.data` e `dataEntrega`
 *    são dias, gravados à meia-noite UTC. Formatar no fuso local jogava a aula
 *    para o dia anterior em todo o Brasil — a grade mostrava 14/08 para a aula
 *    do dia 15. Já aconteceu; por isso é o padrão aqui, e quem precisa de
 *    instante usa `dataHoraBR`.
 */

/** "17/04/2026" — a partir de um dia puro (ISO ou "YYYY-MM-DD"). */
export function dataBR(iso: string | Date): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * "qui" — dia da semana de uma data pura.
 *
 * O ponto final da abreviação sai fora: o CLDR manda "qui." e nem toda build de
 * ICU concorda, então a mesma tela apareceria "qui., 20/08" num navegador e
 * "qui, 20/08" no outro. Fixar aqui é o que torna a saída previsível — e o
 * ponto colado na vírgula não ajudava ninguém a ler.
 */
export function diaDaSemanaBR(iso: string | Date): string {
  return new Date(iso)
    .toLocaleDateString('pt-BR', { weekday: 'short', timeZone: 'UTC' })
    .replace(/\.$/, '');
}

/** "qui, 17/04/2026" — para atalho e sugestão, onde o dia da semana decide. */
export function diaEDataBR(iso: string | Date): string {
  return `${diaDaSemanaBR(iso)}, ${dataBR(iso)}`;
}

/**
 * "15/08/2026" — a partir de um INSTANTE, no fuso de quem lê.
 *
 * A armadilha é o espelho da de cima, e mordeu o painel de admin: um registro
 * salvo às 21:30 em Brasília é 00:30 do dia seguinte em UTC. Formatado como dia
 * puro, aparecia como **amanhã**. `atualizadoEm`, `criadoEm` e qualquer
 * `timestamptz` passam por aqui; `Ocorrencia.data` e `dataEntrega`, por
 * `dataBR`.
 *
 * A regra em uma linha: **se tem hora dentro, o fuso é o local.**
 */
export function dataDoInstanteBR(iso: string | Date): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/**
 * "15/08/2026 20:09" — para INSTANTE, não para dia puro.
 *
 * Aqui o fuso local está certo: um erro registrado às 20:09 aconteceu às 20:09
 * do relógio de quem está lendo o log.
 */
export function dataHoraBR(iso: string | Date): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * O que o `<input type="date">` exige: "YYYY-MM-DD".
 *
 * O campo nativo mostra a data no formato do SISTEMA operacional, que este
 * código não controla — num aparelho em inglês ele exibe MM/DD/YYYY. Por isso
 * a tela mostra `dataBR` ao lado dele como confirmação: o valor que ela vê
 * escrito é o que vale, independente do que o seletor desenhou.
 */
export function paraCampoDeData(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : '';
}
