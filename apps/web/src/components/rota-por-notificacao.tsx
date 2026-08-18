'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { CANAL_ROTA, destinoDaMensagem } from '@/lib/rota-notificacao';

/**
 * Leva a professora para a tela da aula quando ela toca no alarme.
 *
 * Parece redundante com o `navigate()` do service worker, e é justamente onde
 * o iPhone precisa de ajuda: com o app em segundo plano, o `navigate()` resolve
 * sem trocar a rota, e o app volta para a frente na tela em que ela parou. Quem
 * ainda consegue navegar nesse estado é esta página, que está viva — daí o
 * `postMessage` do `sw.js` para cá.
 *
 * Fica no `Providers` porque o alarme pode chegar com ela em qualquer tela; um
 * ouvinte por página seria um esquecimento por página, e o esquecimento é mudo.
 */
export function RotaPorNotificacao() {
  const router = useRouter();

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    function aoReceber(evento: MessageEvent) {
      const destino = destinoDaMensagem(evento.data);
      if (!destino) return;

      // `replace` e não `push`: são 22 alarmes por semana, e cada um empilharia
      // uma aula velha no botão voltar.
      router.replace(destino);
    }

    navigator.serviceWorker.addEventListener('message', aoReceber);
    return () => navigator.serviceWorker.removeEventListener('message', aoReceber);
  }, [router]);

  return null;
}
