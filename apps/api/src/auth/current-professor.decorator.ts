import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthProfessor {
  id: string;
  email: string;
  timezone: string;
}

/**
 * Injeta o professor autenticado, extraído do JWT pelo SupabaseJwtGuard.
 *
 * Este decorator é o coração do multitenant: todo service recebe o `professorId`
 * por aqui e o usa no `where`. Nunca aceite um professorId vindo do body ou da
 * query — seria o caminho direto para um usuário ler dado de outro.
 */
export const CurrentProfessor = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthProfessor => {
    return ctx.switchToHttp().getRequest().professor;
  },
);
