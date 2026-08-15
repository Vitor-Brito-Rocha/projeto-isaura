'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { ApiError } from './api';

/**
 * Manda para o login quando a sessão caiu.
 *
 * Existe como hook, e não como `useEffect` copiado em cada página, porque o
 * modo de falhar é silencioso: uma tela que esquece o redirect não quebra — ela
 * mostra o estado VAZIO. A professora veria "nenhum plano de curso ainda"
 * quando na verdade a sessão expirou, e concluiria que perdeu o trabalho.
 */
export function useRedirecionaSeDeslogado(erro: unknown) {
  const router = useRouter();

  useEffect(() => {
    if (erro instanceof ApiError && erro.status === 401) router.push('/login');
  }, [erro, router]);
}
