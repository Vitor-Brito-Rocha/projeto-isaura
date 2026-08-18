'use client';

import { useQuery } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { apiFetch, ApiError } from './api';

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
 *
 * **`sessaoMorta` pula os dois degraus.** Aí a renovação já foi tentada e
 * falhou: não existe sessão, e o degrau da home só serviria para ela ver a
 * mesma queda de novo. Sem login não há história — vai direto para o login.
 */
export function destinoDoErro(erro: unknown, caminhoAtual: string): '/' | '/login' | null {
  if (!(erro instanceof ApiError)) return null;
  if (erro.sessaoMorta) return '/login';
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


// ---- A trava ----

export type EstadoDaSessao = 'verificando' | 'valida' | 'ausente';

/**
 * Só um 401 explícito significa "não está logada".
 *
 * Rede caída **não** é sessão morta, e a diferença é o produto inteiro: ela usa
 * isto numa sala sem sinal. `fetch` que rejeita por falta de rede nem vira
 * `ApiError` — vira `TypeError` —, então tratar "qualquer erro" como deslogada
 * expulsaria do app justo quem está offline com registro na fila para subir.
 */
export function sessaoAusente(erro: unknown): boolean {
  return erro instanceof ApiError && erro.status === 401;
}

/**
 * A porta de toda tela autenticada.
 *
 * Antes, sem sessão, cada tela descobria isso sozinha pelo 401 da própria
 * consulta — e quem esquecesse o `useRedirecionaEmErro` (os Ajustes, por
 * exemplo) ficava carregando para sempre. Pior: o modo de falhar era mostrar a
 * tela VAZIA, e "nenhum plano de curso ainda" quando a verdade é "você não está
 * logada" é a mensagem que faz alguém achar que perdeu o trabalho.
 *
 * Uma consulta só para o app inteiro (`staleTime: Infinity`), e ela responde
 * antes de qualquer listagem aparecer.
 */
export function useExigeSessao(): EstadoDaSessao {
  const router = useRouter();

  const { data, error } = useQuery({
    queryKey: ['sessao'],
    queryFn: () => apiFetch<{ id: string; email: string }>('/auth/eu'),
    // Sem repetir: o `apiFetch` já tentou renovar antes de deixar o 401 passar.
    retry: false,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const ausente = sessaoAusente(error);

  useEffect(() => {
    // `replace`: o botão voltar não pode devolver para a tela que ela não tem
    // permissão de ver — voltaria e redirecionaria de novo, uma ratoeira.
    if (ausente) router.replace('/login');
  }, [ausente, router]);

  if (ausente) return 'ausente';
  return data ? 'valida' : 'verificando';
}
