import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { PrismaService } from '../prisma/prisma.service';
import { IS_PUBLIC_KEY } from './public.decorator';
import { lerAccessToken } from './session-cookies';

/**
 * Valida o JWT do Supabase contra o JWKS público (ES256) e anexa o professor
 * autenticado à request.
 *
 * É registrado como guard GLOBAL no AppModule de propósito: assim o padrão é
 * "rota fechada", e abrir uma exige o `@Public()` explícito. O inverso — guard
 * por controller — faz uma rota nova nascer aberta por esquecimento, que num
 * sistema multitenant significa vazar dado de outro professor.
 */
@Injectable()
export class SupabaseJwtGuard implements CanActivate {
  private jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
  private issuer = '';

  constructor(
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  private getJwks() {
    if (!this.jwks) {
      const supabaseUrl = this.config.get<string>('SUPABASE_URL');
      if (!supabaseUrl) throw new UnauthorizedException('SUPABASE_URL não configurado.');
      this.issuer = `${supabaseUrl}/auth/v1`;
      this.jwks = createRemoteJWKSet(new URL(`${this.issuer}/.well-known/jwks.json`));
    }
    return this.jwks;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const token = lerAccessToken(request);
    if (!token) throw new UnauthorizedException('Token de autenticação ausente.');

    let sub: string;
    let email: string;
    try {
      const { payload } = await jwtVerify(token, this.getJwks(), { issuer: this.issuer });
      sub = (payload as JWTPayload).sub ?? '';
      if (!sub) throw new Error('sub ausente');
      email = (payload as { email?: string }).email ?? '';
    } catch {
      throw new UnauthorizedException('Token inválido ou expirado.');
    }

    // Fora do try acima: uma conta desativada depois de emitir o token não pode
    // cair na mensagem genérica de "token inválido" — isso manda a pessoa
    // debugar o login quando o problema é outro.
    const professor = await this.prisma.professor.findUnique({
      where: { id: sub },
      select: { ativo: true, timezone: true },
    });
    if (professor && !professor.ativo) throw new UnauthorizedException('Conta desativada.');

    request.professor = {
      id: sub,
      email,
      // Fallback para quem ainda não tem perfil gravado (primeiro login).
      timezone: professor?.timezone ?? 'America/Sao_Paulo',
    };
    return true;
  }
}
