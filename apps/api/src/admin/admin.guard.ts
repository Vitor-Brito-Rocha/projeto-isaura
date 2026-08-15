import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthProfessor } from '../auth/current-professor.decorator';

/**
 * Deixa passar só o email de `ADMIN_EMAIL`.
 *
 * Não existe coluna `ehAdmin` no `Professor` de propósito: administrador é
 * configuração de ambiente, não dado de conta. Uma flag no banco é uma linha de
 * `UPDATE` de distância de virar escalação de privilégio, e o `ErrosService` já
 * decide para quem alertar exatamente por este mesmo caminho.
 *
 * Roda **depois** do `SupabaseJwtGuard` global, então `request.professor` já
 * veio de um JWT validado — não de um header que o cliente escolheu.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const professor: AuthProfessor | undefined = ctx.switchToHttp().getRequest().professor;
    const admin = this.config.get<string>('ADMIN_EMAIL')?.trim().toLowerCase();

    // Sem ADMIN_EMAIL configurado, ninguém entra. O padrão precisa ser fechado:
    // um ambiente sem a variável abriria o painel para toda conta cadastrada.
    if (!admin || !professor?.email || professor.email.toLowerCase() !== admin) {
      throw new ForbiddenException('Área restrita.');
    }
    return true;
  }
}
