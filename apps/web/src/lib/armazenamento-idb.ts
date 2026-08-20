'use client';

import type { Armazenamento, ItemFila } from './fila-offline';
import type { RascunhoLocal } from './rascunho-local';

const BANCO = 'isaura';
const LOJA_FILA = 'fila';
const LOJA_RASCUNHOS = 'rascunhos';
const CHAVE_UNICA = 'pendentes';

/**
 * A versão sobe quando uma loja nova entra — é o `onupgradeneeded` que a cria.
 * Foi 1 enquanto só existia a fila; virou 2 com os rascunhos locais. Instalação
 * antiga abre em 2, ganha a loja que falta e mantém a fila que já estava lá.
 */
const VERSAO = 2;

/** Lê e grava uma lista inteira, sob uma chave só. */
export interface ArmazenamentoDe<T> {
  ler(): Promise<T[]>;
  gravar(itens: T[]): Promise<void>;
}

/**
 * IndexedDB, e não localStorage, por um motivo só: o service worker também
 * precisa alcançar a fila para sincronizar com o app fechado (Background Sync,
 * fase 6). `localStorage` não existe em worker.
 *
 * Cada lista é UM registro, em vez de um por item. São poucas dezenas de itens
 * no pior caso, e ler/gravar a lista completa torna a operação atômica de graça
 * — a alternativa (cursores) abre espaço para gravar metade.
 */
function abrir(): Promise<IDBDatabase> {
  return new Promise((ok, erro) => {
    const req = indexedDB.open(BANCO, VERSAO);
    req.onupgradeneeded = () => {
      for (const loja of [LOJA_FILA, LOJA_RASCUNHOS]) {
        if (!req.result.objectStoreNames.contains(loja)) req.result.createObjectStore(loja);
      }
    };
    req.onsuccess = () => ok(req.result);
    req.onerror = () => erro(req.error);
  });
}

/**
 * A conexão fecha ao fim de cada transação, e é isso que deixa a subida de
 * versão passar: conexão viva noutra aba bloquearia o `onupgradeneeded` sem
 * erro nenhum — o `open` simplesmente nunca resolveria.
 */
function transacao<T>(
  loja: string,
  modo: IDBTransactionMode,
  fn: (loja: IDBObjectStore) => IDBRequest<T>,
) {
  return abrir().then(
    (db) =>
      new Promise<T>((ok, erro) => {
        const t = db.transaction(loja, modo);
        const req = fn(t.objectStore(loja));
        req.onsuccess = () => ok(req.result);
        req.onerror = () => erro(req.error);
        t.oncomplete = () => db.close();
      }),
  );
}

/**
 * Em navegador sem IndexedDB (ou no SSR), a fila vira um balde furado
 * silencioso. Melhor devolver vazio e deixar o erro de rede aparecer na tela do
 * que fingir que salvou.
 */
const indisponivel: ArmazenamentoDe<never> = {
  async ler() {
    return [];
  },
  async gravar() {
    /* sem onde guardar */
  },
};

function armazenamentoEm<T>(loja: string): ArmazenamentoDe<T> {
  if (typeof indexedDB === 'undefined') return indisponivel as ArmazenamentoDe<T>;

  return {
    async ler() {
      try {
        const itens = await transacao<T[] | undefined>(loja, 'readonly', (l) => l.get(CHAVE_UNICA));
        return itens ?? [];
      } catch {
        return [];
      }
    },
    async gravar(itens) {
      await transacao(loja, 'readwrite', (l) => l.put(itens, CHAVE_UNICA));
    },
  };
}

export function armazenamentoDaFila(): Armazenamento {
  return armazenamentoEm<ItemFila>(LOJA_FILA);
}

/**
 * Loja separada da fila de propósito. A fila é o que ela mandou salvar e o app
 * ainda não conseguiu entregar; o rascunho é o que ela nem mandou. Misturar os
 * dois numa lista só faria a sincronização enviar rascunho para o servidor —
 * que é exatamente o que "saída não conferida não vira registro" proíbe.
 */
export function armazenamentoDosRascunhos(): ArmazenamentoDe<RascunhoLocal> {
  return armazenamentoEm<RascunhoLocal>(LOJA_RASCUNHOS);
}
