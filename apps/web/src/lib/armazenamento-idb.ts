'use client';

import type { Armazenamento, ItemFila } from './fila-offline';

const BANCO = 'isaura';
const LOJA = 'fila';
const CHAVE_UNICA = 'pendentes';

/**
 * IndexedDB, e não localStorage, por um motivo só: o service worker também
 * precisa alcançar a fila para sincronizar com o app fechado (Background Sync,
 * fase 6). `localStorage` não existe em worker.
 *
 * A fila inteira é UM registro, em vez de um por item. São poucas dezenas de
 * itens no pior caso, e ler/gravar a lista completa torna a operação atômica de
 * graça — a alternativa (cursores) abre espaço para gravar metade.
 */
function abrir(): Promise<IDBDatabase> {
  return new Promise((ok, erro) => {
    const req = indexedDB.open(BANCO, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(LOJA)) req.result.createObjectStore(LOJA);
    };
    req.onsuccess = () => ok(req.result);
    req.onerror = () => erro(req.error);
  });
}

function transacao<T>(modo: IDBTransactionMode, fn: (loja: IDBObjectStore) => IDBRequest<T>) {
  return abrir().then(
    (db) =>
      new Promise<T>((ok, erro) => {
        const t = db.transaction(LOJA, modo);
        const req = fn(t.objectStore(LOJA));
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
const indisponivel: Armazenamento = {
  async ler() {
    return [];
  },
  async gravar() {
    /* sem onde guardar */
  },
};

export function armazenamentoIndexedDB(): Armazenamento {
  if (typeof indexedDB === 'undefined') return indisponivel;

  return {
    async ler() {
      try {
        const itens = await transacao<ItemFila[] | undefined>('readonly', (l) =>
          l.get(CHAVE_UNICA),
        );
        return itens ?? [];
      } catch {
        return [];
      }
    },
    async gravar(itens) {
      await transacao('readwrite', (l) => l.put(itens, CHAVE_UNICA));
    },
  };
}
