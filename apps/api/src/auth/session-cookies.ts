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

function opcoes(config: ConfigService, maxAgeMs: number) {
  const producao = config.get<string>('NODE_ENV') === 'production';
  return {
    httpOnly: true,
    // `secure` só em produção: em localhost o navegador recusa cookie secure
    // sobre http, e o login simplesmente não persistiria em dev.
    secure: producao,
    sameSite: 'lax' as const,
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
