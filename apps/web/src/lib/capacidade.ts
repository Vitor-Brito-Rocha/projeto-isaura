'use client';

import type { IntensidadeAlarme } from './types';

/**
 * O que este aparelho consegue de fato entregar.
 *
 * Existe porque `IntensidadeAlarme` é uma **intenção**, não uma garantia. A
 * professora escolhe `ALARME` e o que chega depende de onde o app está rodando.
 * A regra do produto é que a tela diga isso na hora da escolha — o pior
 * desfecho possível aqui é ela confiar num alarme que nunca vai tocar e perder
 * o registro de uma aula.
 */
export type Capacidade =
  | 'NATIVO' // wrapper Capacitor: alarme de verdade, fura o silencioso
  | 'ANDROID_WEB' // navegador Android: notificação com vibração própria
  | 'IOS_PWA' // instalado na tela inicial: notificação com som do sistema
  | 'IOS_NAVEGADOR' // Safari sem instalar: push NÃO funciona
  | 'DESKTOP'
  | 'SEM_SUPORTE';

export function detectarCapacidade(): Capacidade {
  if (typeof window === 'undefined') return 'SEM_SUPORTE';

  // O wrapper injeta este global. É a única forma de alarme de verdade.
  if ((window as unknown as { Capacitor?: unknown }).Capacitor) return 'NATIVO';

  const ua = navigator.userAgent;
  const ehIOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && 'ontouchend' in document);
  const ehAndroid = /Android/.test(ua);

  if (ehIOS) {
    // No iOS a Push API só existe para app instalado na tela inicial. No Safari
    // comum ela nem aparece — por isso a checagem é de modo standalone, e não
    // de suporte a API.
    const instalado =
      (navigator as unknown as { standalone?: boolean }).standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches;
    return instalado ? 'IOS_PWA' : 'IOS_NAVEGADOR';
  }

  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'SEM_SUPORTE';
  return ehAndroid ? 'ANDROID_WEB' : 'DESKTOP';
}

/** A intensidade que este aparelho REALMENTE vai entregar. */
export function intensidadeEfetiva(
  escolhida: IntensidadeAlarme,
  capacidade: Capacidade,
): IntensidadeAlarme {
  if (escolhida !== 'ALARME') return escolhida;
  // Alarme de verdade só existe no wrapper nativo. Em todo o resto vira
  // notificação — e a tela precisa dizer isso.
  return capacidade === 'NATIVO' ? 'ALARME' : 'NOTIFICACAO';
}

/**
 * O aviso a mostrar junto da escolha, ou `null` quando o que ela pediu é o que
 * ela vai receber. Texto no lugar de ícone de propósito: um "!" laranja não
 * explica o que vai acontecer.
 */
export function avisoDeDegradacao(
  escolhida: IntensidadeAlarme,
  capacidade: Capacidade,
): string | null {
  if (capacidade === 'IOS_NAVEGADOR') {
    return 'Neste iPhone os alarmes só funcionam com o app instalado na tela inicial. Abra o menu de compartilhar e toque em "Adicionar à Tela de Início".';
  }
  if (capacidade === 'SEM_SUPORTE') {
    return 'Este navegador não suporta notificações. Os registros continuam salvos, mas nada vai avisar você.';
  }
  if (escolhida !== 'ALARME') return null;

  switch (capacidade) {
    case 'NATIVO':
      return null;
    case 'ANDROID_WEB':
      return 'Neste aparelho vai chegar como notificação, não como alarme: pelo navegador não dá para furar o modo silencioso. Instalar o app resolve.';
    case 'IOS_PWA':
      return 'No iPhone vai chegar como notificação, não como alarme. Se o celular estiver no silencioso, ela não toca — isso é limitação do iOS, não do app.';
    default:
      return 'Neste aparelho vai chegar como notificação, não como alarme.';
  }
}

/** Rótulo curto para a lista de cadeiras. */
export function rotuloCapacidade(capacidade: Capacidade): string {
  const rotulos: Record<Capacidade, string> = {
    NATIVO: 'Alarme completo',
    ANDROID_WEB: 'Notificação com vibração',
    IOS_PWA: 'Notificação do sistema',
    IOS_NAVEGADOR: 'Sem alarmes — instale o app',
    DESKTOP: 'Notificação no computador',
    SEM_SUPORTE: 'Sem suporte a notificações',
  };
  return rotulos[capacidade];
}
