'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { ApiError } from './api';

/**
 * Para onde mandar quem levou 401 ou 404 numa consulta.
 *
 * Dois degraus, e o caminho atual é o que diz em qual deles estamos — sem
 * bandeira em `sessionStorage`, sem contador:
 *
 * 1. **Fora da home → home.** Um 401 solto quase nunca é sessão morta: o
 *    `apiFetch` já tentou renovar antes de desistir, mas um endpoint com
 *    problema derrubaria a sessão inteira se a primeira queda mandasse direto
 *    para o login. A home é um lugar que funciona, e chegar nela prova que a
 *    sessão está viva.
 * 2. **Já na home → login.** Se a própria home não carrega, aí é sessão. O
 *    login é a única tela que não faz chamada autenticada, então é o único
 *    destino que não pode entrar em laço.
 *
 * 404 entra junto porque o desfecho é o mesmo: ela abriu um endereço guardado
 * de uma aula que foi apagada, e ficar num cartão de erro sem saída é pior que
 * voltar para a semana.
 */
export function destinoDoErro(erro: unknown, caminhoAtual: string): '/' | '/login' | null {
  if (!(erro instanceof ApiError)) return null;
  if (erro.status !== 401 && erro.status !== 404) return null;
  return caminhoAtual === '/' ? '/login' : '/';
}

export function avisoDoErro(status: number, destino: string): string {
  if (destino === '/login') return 'Sua sessão expirou. Entre de novo para continuar.';
  return status === 404 ? 'Essa aula ou página não existe mais.' : 'Precisei recarregar sua sessão.';
}

/**
 * Tira a professora de tela quebrada.
 *
 * Existe como hook, e não como `useEffect` copiado em cada página, porque o
 * modo de falhar é silencioso: uma tela que esquece o redirect não quebra — ela
 * mostra o estado VAZIO. A professora veria "nenhum plano de curso ainda"
 * quando na verdade a sessão expirou, e concluiria que perdeu o trabalho.
 */
export function useRedirecionaEmErro(erro: unknown) {
  const router = useRouter();
  const caminho = usePathname();

  useEffect(() => {
    const destino = destinoDoErro(erro, caminho);
    if (!destino) return;

    // `replace` e não `push`: com `push`, o botão voltar devolveria para a tela
    // que acabou de falhar, que redirecionaria de novo — uma ratoeira.
    toast.warning(avisoDoErro((erro as ApiError).status, destino));
    router.replace(destino);
  }, [erro, router, caminho]);
}
