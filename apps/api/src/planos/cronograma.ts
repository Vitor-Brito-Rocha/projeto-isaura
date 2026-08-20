/**
 * Quando cada unidade deve começar e terminar — estimado, não copiado.
 *
 * O cronograma escrito no `Plano de Ensino` da Unifor não é lido: aquela tabela
 * não tem régua entre as linhas e o pareamento data → tópico não é recuperável
 * (ver `ia/unifor.ts`). O que sobra dela é a lista de datas, que é confiável, e
 * as horas-aula declaradas por unidade. Isto aqui junta as duas.
 *
 * **Por que vale a pena estimar:** `Unidade.dataFimPrevista` existe no schema
 * desde a fase 1 e nenhuma tela preenche. É dele que `progresso/calcular.ts`
 * depende para dizer "4 tópicos e 3 aulas até 30/09" em vez de "55%" — o número
 * que diz o que fazer. Sem uma data prevista, `calcularRitmo` devolve `null` e o
 * aviso simplesmente não aparece. O recurso está escrito, testado, e morto por
 * falta deste dado.
 *
 * Puro e sem banco, como `progresso/calcular.ts`: é aritmética de divisão com
 * resto, e é onde o erro de um dia a mais ou a menos se esconde.
 */

export interface UnidadeParaEstimar {
  ordem: number;
  /** Horas-aula declaradas. Null quando o plano não declara. */
  cargaHoraria: number | null;
}

export interface PeriodoEstimado {
  ordem: number;
  /** "YYYY-MM-DD" — a primeira e a última aula que caem nesta unidade. */
  dataInicio: string;
  dataFimPrevista: string;
  /** Quantas aulas couberam. É o que a tela mostra ao lado do período. */
  aulas: number;
}

/**
 * Divide `total` entre `pesos` por maior resto.
 *
 * Maior resto e não arredondamento simples porque a soma tem de fechar exata:
 * arredondar cada parte separadamente sobra ou falta aula, e a última unidade
 * herdaria o erro — terminando o semestre num dia que não existe na grade.
 *
 * Cada unidade recebe pelo menos uma aula. Uma unidade com zero aulas não teria
 * data nenhuma, e sumiria do aviso de ritmo justamente por ser a mais apertada.
 */
function repartir(total: number, pesos: number[]): number[] {
  const soma = pesos.reduce((s, p) => s + p, 0);
  const exatos = pesos.map((p) => (total * p) / soma);
  const partes = exatos.map((e) => Math.max(1, Math.floor(e)));

  let sobra = total - partes.reduce((s, p) => s + p, 0);

  // Faltou: vai para quem tem o maior resto, que é a definição do método.
  while (sobra > 0) {
    let alvo = 0;
    for (let i = 1; i < partes.length; i++) {
      if (exatos[i] - partes[i] > exatos[alvo] - partes[alvo]) alvo = i;
    }
    partes[alvo]++;
    sobra--;
  }

  // Sobrou: o piso de uma aula por unidade pode estourar o total quando há
  // muitas unidades para poucas datas. Tira de quem tem mais, nunca de quem
  // está no mínimo.
  while (sobra < 0) {
    let alvo = -1;
    for (let i = 0; i < partes.length; i++) {
      if (partes[i] > 1 && (alvo === -1 || partes[i] > partes[alvo])) alvo = i;
    }
    if (alvo === -1) break;
    partes[alvo]--;
    sobra++;
  }

  return partes;
}

/**
 * Espalha as datas pelas unidades, na proporção das horas-aula.
 *
 * Devolve `[]` quando não dá para estimar — sem datas, ou com menos datas do
 * que unidades. **Não inventa prazo**, que é a mesma regra do `calcularRitmo`:
 * uma data prevista errada é pior do que nenhuma, porque o aviso de ritmo passa
 * a mentir e ela para de olhar para ele.
 */
export function estimarCronograma(
  unidades: UnidadeParaEstimar[],
  /** Datas das aulas, "YYYY-MM-DD". Ordem não importa — são ordenadas aqui. */
  encontros: string[],
): PeriodoEstimado[] {
  if (unidades.length === 0) return [];

  const datas = [...new Set(encontros)].sort();
  if (datas.length < unidades.length) return [];

  const ordenadas = [...unidades].sort((a, b) => a.ordem - b.ordem);

  // Ou todas as unidades declaram carga, ou nenhuma conta: com carga em umas e
  // não em outras, as sem declaração ficariam com peso zero e uma aula só —
  // pior do que a divisão igual, que ao menos não finge saber.
  const todasDeclaram = ordenadas.every((u) => (u.cargaHoraria ?? 0) > 0);
  const pesos = ordenadas.map((u) => (todasDeclaram ? (u.cargaHoraria as number) : 1));

  const partes = repartir(datas.length, pesos);

  let cursor = 0;
  return ordenadas.map((u, i) => {
    const fatia = datas.slice(cursor, cursor + partes[i]);
    cursor += partes[i];
    return {
      ordem: u.ordem,
      dataInicio: fatia[0],
      dataFimPrevista: fatia[fatia.length - 1],
      aulas: fatia.length,
    };
  });
}
