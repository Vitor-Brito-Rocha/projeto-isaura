import type { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';

export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';

export interface SupabaseSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: { id: string; email?: string };
}

/**
 * O front está em OUTRO site que não a API?
 *
 * No caminho normal do navegador, não: as chamadas vão para a origem do Next,
 * que repassa, e tudo é same-origin. Mas em dois casos o front fala direto com a
 * API, e aí `SameSite=Lax` descarta o cookie na ida — o navegador guarda e
 * simplesmente não manda. O sintoma é cruel: o login parece dar certo e a tela
 * seguinte já está deslogada, sem erro nenhum.
 *
 * 1. Front publicado (Vercel) apontando para a API por um túnel (ngrok) ou pelo
 *    endereço da VPS — que é como se testa a mesma tela contra ambientes
 *    diferentes sem gerar build novo.
 * 2. O wrapper Capacitor, que não tem o proxy do Next.
 *
 * Fica atrás de variável porque afrouxa uma defesa de verdade: `Lax` é o que
 * impede um site qualquer de disparar requisição autenticada em nome dela. Com
 * `None`, quem barra passa a ser só o CORS (`WEB_ORIGIN`) — então ligar isto
 * obriga a manter aquela lista curta e certa.
 */
function crossSite(config: ConfigService): boolean {
  return config.get<string>('COOKIE_CROSS_SITE') === '1';
}

function opcoes(config: ConfigService, maxAgeMs: number) {
  const producao = config.get<string>('NODE_ENV') === 'production';
  const entreSites = crossSite(config);
  return {
    httpOnly: true,
    // `secure` só em produção: em localhost o navegador recusa cookie secure
    // sobre http, e o login simplesmente não persistiria em dev.
    //
    // Com `SameSite=None` deixa de ser escolha: o navegador DESCARTA o cookie
    // sem `Secure`. Por isso os dois andam juntos — e por isso o outro lado do
    // túnel precisa ser https (ngrok já é; `localhost:3333` cru não serve).
    secure: entreSites || producao,
    sameSite: entreSites ? ('none' as const) : ('lax' as const),
    path: '/',
    maxAge: maxAgeMs,
  };
}

export function setSessionCookies(config: ConfigService, res: Response, session: SupabaseSession) {
  // O access token vive pouco (o Supabase emite ~1h); o refresh dura 30 dias e é
  // o que evita relogar toda semana.
  res.cookie(ACCESS_COOKIE, session.access_token, opcoes(config, session.expires_in * 1000));
  res.cookie(REFRESH_COOKIE, session.refresh_token, opcoes(config, 30 * 24 * 3600 * 1000));
}

export function clearSessionCookies(config: ConfigService, res: Response) {
  const base = { ...opcoes(config, 0), maxAge: undefined };
  res.clearCookie(ACCESS_COOKIE, base);
  res.clearCookie(REFRESH_COOKIE, base);
}

/**
 * Lê o access token do cookie ou do header Authorization.
 *
 * Os dois caminhos existem porque o navegador manda cookie automaticamente (e
 * httpOnly protege contra XSS), mas o wrapper Capacitor e qualquer cliente não
 * navegador mandam Bearer.
 */
export function lerAccessToken(req: Request): string | null {
  const cookie = (req as any).cookies?.[ACCESS_COOKIE];
  if (cookie) return cookie;

  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);

  return null;
}

export function lerRefreshToken(req: Request): string | null {
  return (req as any).cookies?.[REFRESH_COOKIE] ?? null;
}
