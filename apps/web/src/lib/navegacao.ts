'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect } from 'react';

/**
 * Existe tela anterior DENTRO do app?
 *
 * A conta é o crescimento do `history.length` desde que o app carregou, e não
 * um contador próprio de rotas visitadas — porque é exatamente essa a
 * semântica que se quer:
 *
 * - `push` (todo `<Link>`, todo `router.push`) acrescenta entrada → cresce.
 * - `replace` **não** acrescenta. E é assim que a notificação abre uma aula
 *   (`<RotaPorNotificacao>` usa `router.replace`), justamente para não empilhar
 *   22 entradas por semana. Um contador de rotas visitadas acharia que houve
 *   navegação e mandaria `back()` para FORA do app.
 * - Comparar com o valor do carregamento descarta o que já havia no histórico
 *   antes do app — o site de onde ela veio não conta como tela anterior.
 *
 * Quando o navegador estoura o teto de entradas (~50), o número para de crescer
 * e a resposta vira "não há tela anterior". Erra para o lado seguro: a home.
 */
export function temTelaAnterior(noCarregamento: number | null, agora: number): boolean {
  if (noCarregamento === null) return false;
  return agora > noCarregamento;
}

/** Quanto o histórico já tinha quando o app abriu. `null` até o app montar. */
let noCarregamento: number | null = null;

export function marcarInicioDoHistorico(comprimento: number): void {
  // `??=` e não `=`: o efeito do React roda duas vezes em desenvolvimento, e a
  // segunda gravaria um valor já contaminado pela navegação que houve no meio.
  noCarregamento ??= comprimento;
}

/** Uma vez por app, no `Providers`. Precisa rodar antes de qualquer navegação. */
export function useInicioDoHistorico(): void {
  useEffect(() => {
    marcarInicioDoHistorico(window.history.length);
  }, []);
}

/**
 * Sai desta tela para a de onde ela veio — ou para a home, se veio de lugar
 * nenhum.
 *
 * O caso "de lugar nenhum" não é raro aqui: é o alarme. O push abre
 * `/aula?ocorrencia=…` direto, e nesse carregamento não existe tela anterior
 * para voltar — `back()` sairia do app, que para um app instalado significa
 * tela em branco.
 */
export function useVoltar(): () => void {
  const router = useRouter();

  return useCallback(() => {
    if (temTelaAnterior(noCarregamento, window.history.length)) router.back();
    // `replace`: a tela que ela acabou de deixar não deve voltar pelo botão
    // de voltar do aparelho — a aula cancelada já não é para onde ir.
    else router.replace('/');
  }, [router]);
}
