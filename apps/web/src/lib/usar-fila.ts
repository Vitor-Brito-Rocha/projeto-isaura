'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, ApiError } from './api';
import { armazenamentoIndexedDB } from './armazenamento-idb';
import {
  criarFila,
  ErroPermanente,
  type Fila,
  type ItemFila,
  type ResultadoSync,
} from './fila-offline';

let fila: Fila | null = null;

function obterFila(): Fila {
  fila ??= criarFila(armazenamentoIndexedDB());
  return fila;
}

/**
 * Uma sincronização por vez em todo o app.
 *
 * O hook é usado na casca e nos dois formulários, e cada instância chama
 * `sincronizar` ao montar. Sem esta trava, duas varreduras concorrentes leriam
 * a mesma fila e enviariam o mesmo fechamento duas vezes — os PUTs são
 * idempotentes, então não corromperia dado, mas a segunda passada removeria
 * itens que a primeira ainda não tinha confirmado.
 */
let sincronizacaoEmCurso: Promise<ResultadoSync> | null = null;

/**
 * Envia um item da fila.
 *
 * O que separa "tenta de novo" de "desiste": 4xx é defeito do pedido e nunca
 * vai passar — aula apagada, validação, tópico que não existe mais. 401 fica de
 * fora porque o `apiFetch` já tenta renovar a sessão, e se ainda assim falhar é
 * recuperável (ela loga de novo e a fila sobe).
 */
async function enviarItem(item: ItemFila): Promise<void> {
  try {
    await apiFetch(item.caminho, { method: item.metodo, body: item.corpo });
  } catch (e) {
    if (e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 401) {
      throw new ErroPermanente(e.message);
    }
    throw e;
  }
}

/**
 * Salva passando pela rede quando dá, e pela fila quando não dá.
 *
 * A tela precisa saber a diferença para poder DIZER a diferença: prometer
 * "salvo" quando o registro está só no aparelho é a mesma classe de erro que
 * prometer um alarme que não toca.
 */
export type Desfecho = 'enviado' | 'enfileirado';

export function useFilaOffline() {
  const [pendentes, setPendentes] = useState(0);

  const atualizarContagem = useCallback(async () => {
    setPendentes(await obterFila().contar());
  }, []);

  const sincronizar = useCallback(async () => {
    sincronizacaoEmCurso ??= obterFila()
      .sincronizar(enviarItem)
      .finally(() => {
        sincronizacaoEmCurso = null;
      });
    const r = await sincronizacaoEmCurso;
    await atualizarContagem();
    return r;
  }, [atualizarContagem]);

  useEffect(() => {
    void sincronizar();
    // `online` é o gatilho barato; ele não cobre "voltou a ter sinal de
    // verdade" (o evento dispara com wi-fi de escola que não roteia), mas o
    // custo de uma tentativa que falha é uma requisição, e a fila sobrevive.
    const aoVoltar = () => void sincronizar();
    window.addEventListener('online', aoVoltar);
    return () => window.removeEventListener('online', aoVoltar);
  }, [sincronizar]);

  const salvar = useCallback(
    async (chave: string, caminho: string, corpo: unknown): Promise<Desfecho> => {
      const texto = JSON.stringify(corpo);
      try {
        await apiFetch(caminho, { method: 'PUT', body: texto });
        return 'enviado';
      } catch (e) {
        // Erro de validação não vai para a fila: repetir não conserta, e a
        // professora precisa ver a mensagem agora para corrigir.
        if (e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 401) {
          throw e;
        }
        await obterFila().enfileirar({ chave, caminho, metodo: 'PUT', corpo: texto });
        await atualizarContagem();
        return 'enfileirado';
      }
    },
    [atualizarContagem],
  );

  return { salvar, sincronizar, pendentes };
}
