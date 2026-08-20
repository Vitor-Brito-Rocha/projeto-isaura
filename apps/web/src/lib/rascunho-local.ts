/**
 * O que ela digitou e **ainda não salvou**.
 *
 * A fila offline (`fila-offline.ts`) já cobre "clicou em Salvar e a rede não
 * estava lá". O que ficava descoberto era o degrau anterior, e é o mais comum:
 * ela escreve metade do fechamento, o alarme da próxima turma toca, ela troca
 * de tela — e o texto some, porque só existia em `useState`. Não há erro, não
 * há aviso; ela volta e encontra o formulário em branco.
 *
 * A regra que isto NÃO muda: rascunho local não é registro. Ele não vai para o
 * servidor, não conta no progresso e não aparece no histórico. É memória do
 * aparelho para que o gesto de salvar continue sendo dela.
 *
 * Puro de propósito, como a fila: decidir "o que abre na tela" a partir de três
 * fontes (rascunho local, rascunho da IA, registro salvo) é exatamente onde
 * mora o erro que apaga trabalho — e isso precisa ser testável sem navegador.
 */

export interface RascunhoLocal {
  /**
   * Identidade lógica do formulário: `abertura:<ocorrenciaId>` ou
   * `fechamento:<ocorrenciaId>` — a mesma forma que a fila usa, porque são as
   * duas metades do mesmo gesto e confundir uma com a outra escreveria o plano
   * da próxima aula por cima do que ela deu.
   */
  chave: string;
  valores: Record<string, unknown>;
  /** Relógio do APARELHO. Só é comparado consigo mesmo — ver `podar`. */
  salvoEm: number;
}

/**
 * Depois disto o rascunho é lixo, não memória.
 *
 * Trinta dias porque o caso real é "a aula de terça que eu não terminei de
 * registrar", não "o semestre passado". Sem poda, a lista cresce para sempre
 * num armazenamento que o navegador pode decidir limpar inteiro quando aperta.
 */
export const VALIDADE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * A forma canônica de um conjunto de campos, para comparar dois deles.
 *
 * Ordena as chaves e o conteúdo dos arrays: marcar os tópicos A e B é o mesmo
 * estado que marcar B e A, e tratar isso como diferença faria a tela anunciar
 * um rascunho recuperado que não muda nada.
 */
export function assinatura(valores: object): string {
  const campos = valores as Record<string, unknown>;
  return JSON.stringify(
    Object.keys(campos)
      .sort()
      .map((k) => {
        const v = campos[k];
        return [k, Array.isArray(v) ? [...v].map(String).sort() : v];
      }),
  );
}

export function mesmosValores(a: object, b: object): boolean {
  return assinatura(a) === assinatura(b);
}

/** Tira o que passou da validade. */
export function podar(lista: RascunhoLocal[], agora: number): RascunhoLocal[] {
  return lista.filter((r) => agora - r.salvoEm < VALIDADE_MS);
}

export function remover(lista: RascunhoLocal[], chave: string): RascunhoLocal[] {
  return lista.filter((r) => r.chave !== chave);
}

/**
 * Grava por cima do rascunho anterior desta mesma chave.
 *
 * Substitui em vez de acumular, pela mesma razão da fila: o que importa é o
 * último estado da tela, não o histórico de teclas.
 */
export function guardar(
  lista: RascunhoLocal[],
  chave: string,
  valores: object,
  agora: number,
): RascunhoLocal[] {
  return [
    ...remover(lista, chave),
    { chave, valores: valores as Record<string, unknown>, salvoEm: agora },
  ];
}

/**
 * O rascunho que vale a pena restaurar, ou null.
 *
 * **Igual ao servidor não é rascunho.** Se o que está guardado no aparelho é o
 * mesmo que o registro já traz — porque a fila subiu, porque ela salvou noutra
 * aba, porque ela desfez tudo o que tinha mudado —, restaurar não recupera
 * nada e o aviso na tela seria mentira: "recuperamos o que você não salvou"
 * apontando para exatamente o que está salvo. Some calado.
 */
export function recuperar<T extends object>(
  lista: RascunhoLocal[],
  chave: string,
  doServidor: T,
): T | null {
  const achado = lista.find((r) => r.chave === chave);
  if (!achado) return null;
  if (mesmosValores(achado.valores, doServidor)) return null;
  return achado.valores as T;
}
