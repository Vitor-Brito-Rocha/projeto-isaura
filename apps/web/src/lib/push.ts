'use client';

import { apiFetch } from './api';
import { detectarCapacidade } from './capacidade';

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

export function pushSuportado(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** A chave VAPID vem em base64url; o PushManager quer bytes. */
function base64UrlParaBytes(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalizado = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const bruto = atob(normalizado);
  const out = new Uint8Array(bruto.length);
  for (let i = 0; i < bruto.length; i++) out[i] = bruto.charCodeAt(i);
  return out;
}

export async function registrarServiceWorker(): Promise<ServiceWorkerRegistration> {
  const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  await navigator.serviceWorker.ready;
  return reg;
}

/**
 * Pede permissão, registra o service worker, assina o push e manda a
 * subscription para a API.
 *
 * As mensagens de erro são específicas de propósito: "não foi possível ativar"
 * faz a professora tentar de novo pelo mesmo caminho que já falhou. Saber que
 * precisa instalar o app na tela inicial, ou que negou a permissão, é o que a
 * desbloqueia.
 */
export async function ativarNotificacoes(): Promise<void> {
  const capacidade = detectarCapacidade();

  if (capacidade === 'IOS_NAVEGADOR') {
    throw new Error(
      'No iPhone é preciso instalar o app antes: toque em compartilhar e depois em "Adicionar à Tela de Início".',
    );
  }
  if (!pushSuportado()) {
    throw new Error('Este navegador não suporta notificações.');
  }
  if (!VAPID_PUBLIC) {
    throw new Error('Chave VAPID não configurada no app (NEXT_PUBLIC_VAPID_PUBLIC_KEY).');
  }

  const permissao = await Notification.requestPermission();
  if (permissao === 'denied') {
    throw new Error(
      'A permissão de notificação foi negada. Libere nas configurações do navegador para este site.',
    );
  }
  if (permissao !== 'granted') throw new Error('Permissão de notificação não concedida.');

  const reg = await registrarServiceWorker();

  // Cancela a subscription anterior antes de criar a nova: se a chave VAPID
  // mudou (troca de ambiente, reset em dev), a antiga continua "válida" para o
  // navegador mas o servidor não consegue mais assinar para ela — e o push
  // falha em silêncio.
  const existente = await reg.pushManager.getSubscription();
  if (existente) await existente.unsubscribe();

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlParaBytes(VAPID_PUBLIC) as BufferSource,
  });

  const json = sub.toJSON();
  await apiFetch('/push/subscribe', {
    method: 'POST',
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: json.keys,
      userAgent: navigator.userAgent,
    }),
  });
}

export async function desativarNotificacoes(): Promise<void> {
  if (!pushSuportado()) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;

  // Avisa o servidor primeiro, mas não deixa a falha dele impedir o
  // cancelamento local — senão ela fica presa recebendo alarme que pediu para
  // parar. O servidor limpa sozinho no primeiro 410.
  await apiFetch('/push/unsubscribe', {
    method: 'POST',
    body: JSON.stringify({ endpoint: sub.endpoint }),
  }).catch(() => undefined);
  await sub.unsubscribe();
}

export async function notificacoesAtivas(): Promise<boolean> {
  if (!pushSuportado() || Notification.permission !== 'granted') return false;
  const reg = await navigator.serviceWorker.getRegistration();
  return Boolean(await reg?.pushManager.getSubscription());
}

export async function enviarPushTeste(): Promise<number> {
  const r = await apiFetch<{ enviados: number }>('/push/teste', {
    method: 'POST',
    body: JSON.stringify({}),
  });
  return r.enviados;
}
