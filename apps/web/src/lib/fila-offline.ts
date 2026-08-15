/**
 * Fila de escrita para quando a rede falta.
 *
 * A sala sem sinal não é hipótese: é o caso normal no fechamento da aula, que é
 * justamente quando o registro precisa ser feito. Sem isto, "não foi possível
 * salvar" significa que ela digitou tudo à toa — e uma vez que isso acontece,
 * ela para de confiar no app.
 *
 * A lógica mora aqui, separada do IndexedDB de propósito: fila é onde erro de
 * ordem e de duplicata se esconde, e isso precisa ser testável sem navegador.
 * O armazenamento entra por parâmetro (`Armazenamento`), então o teste usa um
 * Map e o app usa IndexedDB.
 */

export interface ItemFila {
  /**
   * Identidade LÓGICA do que está sendo salvo — não do clique.
   *
   * "Fechamento da aula X" é uma chave só. Se ela corrigir o texto três vezes
   * offline, o servidor precisa receber a última versão, não três. Por isso
   * enfileirar substitui em vez de acumular.
   */
  chave: string;
  /**
   * Identidade da GRAVAÇÃO, única por enfileiramento.
   *
   * Serve para a sincronização remover exatamente o item que subiu. Não dá para
   * usar `criadoEm` nisso: duas gravações no mesmo milissegundo ficariam
   * indistinguíveis, e a correção feita durante o envio seria descartada como
   * se já tivesse subido.
   */
  id: string;
  caminho: string;
  metodo: string;
  corpo: string;
  criadoEm: number;
}

function novoId(): string {
  const c = globalThis.crypto;
  if (c && 'randomUUID' in c) return c.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export interface Armazenamento {
  ler(): Promise<ItemFila[]>;
  gravar(itens: ItemFila[]): Promise<void>;
}

/** O que fazer com um item na hora de enviar. */
export type Enviar = (item: ItemFila) => Promise<void>;

/**
 * Erro que não adianta repetir.
 *
 * 4xx (menos 401) é defeito do pedido: validação, aula que não existe mais,
 * tópico de outra conta. Repetir para sempre entupiria a fila e bloquearia os
 * itens bons atrás dele. 401 fica de fora porque É recuperável — a sessão pode
 * renovar — e 5xx/rede também.
 */
export class ErroPermanente extends Error {}

export interface ResultadoSync {
  enviados: number;
  descartados: number;
  restantes: number;
}

export function criarFila(armazenamento: Armazenamento) {
  return {
    async enfileirar(item: Omit<ItemFila, 'criadoEm' | 'id'>): Promise<void> {
      const atuais = await armazenamento.ler();
      const semAntigo = atuais.filter((i) => i.chave !== item.chave);
      // Vai para o FIM mesmo quando substitui: a ordem que importa é a da
      // última intenção dela, e o fechamento reescrito agora deve chegar
      // depois do que ela salvou há dez minutos noutra aula.
      await armazenamento.gravar([
        ...semAntigo,
        { ...item, id: novoId(), criadoEm: Date.now() },
      ]);
    },

    async pendentes(): Promise<ItemFila[]> {
      return armazenamento.ler();
    },

    async contar(): Promise<number> {
      return (await armazenamento.ler()).length;
    },

    async descartar(chave: string): Promise<void> {
      const atuais = await armazenamento.ler();
      await armazenamento.gravar(atuais.filter((i) => i.chave !== chave));
    },

    /**
     * Envia na ordem e para no primeiro erro recuperável.
     *
     * Parar importa: se a rede caiu de novo, insistir nos seguintes só gera
     * ruído. Já o item com defeito permanente é descartado para não travar a
     * fila — a alternativa seria uma fila que nunca mais anda.
     */
    async sincronizar(enviar: Enviar): Promise<ResultadoSync> {
      const fila = await armazenamento.ler();
      const resolvidos: ItemFila[] = [];
      let enviados = 0;
      let descartados = 0;

      for (const item of fila) {
        try {
          await enviar(item);
          enviados++;
          resolvidos.push(item);
        } catch (e) {
          if (e instanceof ErroPermanente) {
            descartados++;
            resolvidos.push(item);
            continue;
          }
          break; // recuperável: guarda este e os seguintes para a próxima
        }
      }

      // Relê antes de gravar, e tira só as gravações EXATAS que saíram, por
      // `id`. Ela pode ter reeditado o mesmo fechamento enquanto a
      // sincronização corria; esse item tem a mesma chave mas id diferente, e
      // precisa sobreviver. Filtrar por chave apagaria a correção dela em
      // silêncio — o pior desfecho possível numa fila que existe justamente
      // para não perder trabalho.
      const agora = await armazenamento.ler();
      const idsResolvidos = new Set(resolvidos.map((r) => r.id));
      const restante = agora.filter((i) => !idsResolvidos.has(i.id));

      await armazenamento.gravar(restante);
      return { enviados, descartados, restantes: restante.length };
    },
  };
}

export type Fila = ReturnType<typeof criarFila>;
