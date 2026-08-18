/**
 * Mesmo valor do `public/sw.js`. Mudar de um lado só faz o clique na
 * notificação virar nada, sem erro em lugar nenhum — por isso os dois lados
 * têm teste.
 */
export const CANAL_ROTA = 'ir-para';

/**
 * Para onde ir quando o service worker manda uma mensagem — ou `null`.
 *
 * Puro porque é o que decide se um dado que veio de FORA do React vira
 * navegação. A mensagem chega de um service worker da mesma origem, mas o
 * destino é aplicado sem clique nenhum dela: aceitar `https://…` ou `//outro`
 * aqui seria redirecionamento aberto, com a sessão dela junto. Mesma régua do
 * `validarBase` — só caminho da própria origem passa.
 */
export function destinoDaMensagem(dados: unknown): string | null {
  if (!dados || typeof dados !== 'object') return null;

  const m = dados as { tipo?: unknown; url?: unknown };
  if (m.tipo !== CANAL_ROTA || typeof m.url !== 'string') return null;

  // `//outro.com` é protocolo-relativo: começa com "/" e mesmo assim sai daqui.
  if (!m.url.startsWith('/') || m.url.startsWith('//')) return null;

  return m.url;
}
