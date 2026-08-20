/**
 * A loja nova só existe se a VERSÃO subir junto.
 *
 * Este teste existe porque a falha é muda dos dois lados. `transacao` estoura
 * `NotFoundError` quando a loja não foi criada, e o `catch` de `ler` — que está
 * certo, é o que impede uma leitura falha de derrubar a tela — devolve lista
 * vazia. O desfecho seria o rascunho nunca persistir: sem erro no console, sem
 * nada na tela, e ela perdendo o que digitou exatamente como antes.
 *
 * O `indexedDB` de mentira segue o mesmo caminho do `sw.spec.ts`: executar o
 * código de verdade contra um ambiente falso, porque esta é lógica que não roda
 * dentro de nenhuma página e nenhum `tsc` alcança.
 */
import type { RascunhoLocal } from './rascunho-local';

interface Req {
  result?: unknown;
  error: unknown;
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
  onupgradeneeded: (() => void) | null;
}

function novaReq(): Req {
  return { error: null, onsuccess: null, onerror: null, onupgradeneeded: null };
}

function montarBancoFalso() {
  const lojas = new Set<string>();
  const conteudo = new Map<string, unknown>();
  const versoesAbertas: number[] = [];
  let fechamentos = 0;

  const banco = {
    objectStoreNames: { contains: (n: string) => lojas.has(n) },
    createObjectStore: (n: string) => lojas.add(n),
    close: () => {
      fechamentos++;
    },
    transaction: (nome: string) => {
      // O IndexedDB de verdade recusa a transação numa loja inexistente. É este
      // erro que o teste precisa reproduzir.
      if (!lojas.has(nome)) throw new Error(`NotFoundError: ${nome}`);

      const t: { oncomplete: (() => void) | null; objectStore: () => unknown } = {
        oncomplete: null,
        objectStore: () => ({
          get: (chave: string) => {
            const r = novaReq();
            r.result = conteudo.get(`${nome}:${chave}`);
            queueMicrotask(() => {
              r.onsuccess?.();
              t.oncomplete?.();
            });
            return r;
          },
          put: (valor: unknown, chave: string) => {
            const r = novaReq();
            conteudo.set(`${nome}:${chave}`, valor);
            queueMicrotask(() => {
              r.onsuccess?.();
              t.oncomplete?.();
            });
            return r;
          },
        }),
      };
      return t;
    },
  };

  (globalThis as unknown as { indexedDB: unknown }).indexedDB = {
    open: (_nome: string, versao: number) => {
      versoesAbertas.push(versao);
      const req = novaReq();
      req.result = banco;
      queueMicrotask(() => {
        // O navegador só chama isto quando a versão pedida é maior que a
        // guardada. Aqui roda sempre que ainda falta loja, que dá no mesmo.
        req.onupgradeneeded?.();
        req.onsuccess?.();
      });
      return req;
    },
  };

  return { lojas, versoesAbertas, fechamentos: () => fechamentos };
}

function carregar() {
  jest.resetModules();
  return require('./armazenamento-idb') as typeof import('./armazenamento-idb');
}

describe('armazenamento em IndexedDB', () => {
  afterEach(() => {
    delete (globalThis as unknown as { indexedDB?: unknown }).indexedDB;
  });

  it('cria as DUAS lojas na subida de versão', async () => {
    // Criar só a da fila deixaria os rascunhos numa loja que não existe, e o
    // `catch` de `ler` transformaria isso em "não havia rascunho nenhum".
    const falso = montarBancoFalso();
    const idb = carregar();

    await idb.armazenamentoDosRascunhos().ler();

    expect([...falso.lojas].sort()).toEqual(['fila', 'rascunhos']);
  });

  it('pede versão maior que 1 — é o que dá a loja nova a quem já tinha o app', () => {
    // Instalação antiga tem o banco na versão 1, com a loja da fila. Sem subir
    // a versão, `onupgradeneeded` nunca roda e a loja dos rascunhos não nasce.
    const falso = montarBancoFalso();
    const idb = carregar();

    void idb.armazenamentoDaFila().ler();

    expect(falso.versoesAbertas[0]).toBeGreaterThan(1);
  });

  it('grava e lê a mesma lista', async () => {
    montarBancoFalso();
    const idb = carregar();
    const rascunhos: RascunhoLocal[] = [
      { chave: 'fechamento:oc1', valores: { conteudo: 'Frações' }, salvoEm: 1 },
    ];

    await idb.armazenamentoDosRascunhos().gravar(rascunhos);

    expect(await idb.armazenamentoDosRascunhos().ler()).toEqual(rascunhos);
  });

  it('fila e rascunhos não se misturam', async () => {
    // Se dividissem a lista, a sincronização mandaria para o servidor o que ela
    // nem pediu para salvar.
    montarBancoFalso();
    const idb = carregar();

    await idb.armazenamentoDosRascunhos().gravar([
      { chave: 'fechamento:oc1', valores: {}, salvoEm: 1 },
    ]);

    expect(await idb.armazenamentoDaFila().ler()).toEqual([]);
  });

  it('fecha a conexão ao fim da transação — é o que deixa a subida de versão passar', async () => {
    // Conexão viva noutra aba bloqueia o `onupgradeneeded` sem erro nenhum: o
    // `open` simplesmente nunca resolve.
    const falso = montarBancoFalso();
    const idb = carregar();

    await idb.armazenamentoDaFila().ler();

    expect(falso.fechamentos()).toBe(1);
  });

  it('sem IndexedDB devolve vazio em vez de estourar', async () => {
    // Navegação privada em alguns navegadores, e o SSR. Melhor um balde furado
    // silencioso do que a tela caindo.
    const idb = carregar();

    expect(await idb.armazenamentoDosRascunhos().ler()).toEqual([]);
  });
});
