/**
 * "Onde eu parei no 8º A?" — o cálculo, sem banco.
 *
 * Duas regras atravessam tudo aqui, e as duas existem por causa do que o número
 * vira depois:
 *
 * 1. **Rascunho não conta.** Quem chama já filtra por `revisadoEm`, mas vale
 *    repetir a razão: um tópico marcado por um resumo de IA que ela não
 *    conferiu não pode empurrar a barra — o número que ela mostra à coordenação
 *    seria, em parte, saída de modelo.
 * 2. **Tópico revisitado conta uma vez.** Ela volta ao mesmo assunto em três
 *    aulas quando a turma não pegou; isso é ensino, não progresso.
 */

export interface TopicoDoPlano {
  id: string;
  titulo: string;
}

export interface UnidadeDoPlano {
  id: string;
  ordem: number;
  titulo: string;
  /** "YYYY-MM-DD" ou null. É o que transforma progresso em aviso. */
  dataFimPrevista: string | null;
  topicos: TopicoDoPlano[];
}

export interface ProgressoUnidade {
  id: string;
  ordem: number;
  titulo: string;
  dataFimPrevista: string | null;
  total: number;
  cobertos: number;
  /** Os que ainda faltam, na ordem do plano — é a lista do que dar. */
  faltando: TopicoDoPlano[];
  concluida: boolean;
}

/**
 * O aviso de ritmo.
 *
 * `apertado` é o único campo que a tela precisa para decidir a cor, e sai de
 * uma comparação só: tópicos que faltam contra aulas que sobram. Sem ele a tela
 * teria de refazer a conta e as duas poderiam divergir.
 */
export interface Ritmo {
  topicosFaltando: number;
  aulasAte: number;
  dataFimPrevista: string;
  apertado: boolean;
}

export function progressoDasUnidades(
  unidades: UnidadeDoPlano[],
  cobertos: ReadonlySet<string>,
): ProgressoUnidade[] {
  return unidades.map((u) => {
    const faltando = u.topicos.filter((t) => !cobertos.has(t.id));
    return {
      id: u.id,
      ordem: u.ordem,
      titulo: u.titulo,
      dataFimPrevista: u.dataFimPrevista,
      total: u.topicos.length,
      cobertos: u.topicos.length - faltando.length,
      faltando,
      // Unidade sem tópico nenhum não é "concluída": não há o que concluir, e
      // marcá-la como pronta faria o plano inteiro parecer terminado.
      concluida: u.topicos.length > 0 && faltando.length === 0,
    };
  });
}

/**
 * Onde a turma está: a primeira unidade que ainda tem tópico faltando.
 *
 * Pela ORDEM do plano, e não pela última aula registrada. Ela pode ter dado uma
 * aula avulsa da unidade 3 antes de terminar a 2 — o que ainda falta continua
 * sendo a 2, e é isso que ela precisa ver.
 */
export function unidadeAtual(unidades: ProgressoUnidade[]): ProgressoUnidade | null {
  return [...unidades].sort((a, b) => a.ordem - b.ordem).find((u) => !u.concluida) ?? null;
}

/**
 * Quanto falta contra quanto sobra.
 *
 * É o número que importa: "55%" não diz o que fazer, "4 tópicos e 3 aulas até
 * 30/09" diz. Só existe quando a unidade tem data prevista — sem ela não há
 * contra o que comparar, e inventar um prazo seria pior que não avisar.
 */
export function calcularRitmo(
  unidade: ProgressoUnidade | null,
  /** Datas "YYYY-MM-DD" das aulas ainda por vir desta cadeira, já sem canceladas. */
  aulasFuturas: string[],
): Ritmo | null {
  if (!unidade?.dataFimPrevista || unidade.faltando.length === 0) return null;

  const limite = unidade.dataFimPrevista;
  const aulasAte = aulasFuturas.filter((d) => d <= limite).length;

  return {
    topicosFaltando: unidade.faltando.length,
    aulasAte,
    dataFimPrevista: limite,
    // Empate não é apertado: 4 tópicos em 4 aulas fecha. Menos aula que tópico,
    // sim — e zero aula com tópico faltando é o caso mais gritante.
    apertado: unidade.faltando.length > aulasAte,
  };
}

/** Percentual inteiro, ou null quando não há denominador. */
export function percentual(cobertos: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((cobertos / total) * 100);
}
