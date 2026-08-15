'use client';

import { useQuery } from '@tanstack/react-query';
import {
  BookOpen,
  CalendarDays,
  CloudOff,
  GraduationCap,
  Settings,
  ShieldCheck,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { useFilaOffline } from '@/lib/usar-fila';
import { cn } from '@/lib/utils';

const ITENS = [
  { href: '/', rotulo: 'Semana', Icone: CalendarDays },
  { href: '/cadeiras', rotulo: 'Cadeiras', Icone: GraduationCap },
  { href: '/planos', rotulo: 'Planos', Icone: BookOpen },
  { href: '/config', rotulo: 'Ajustes', Icone: Settings },
] as const;

const ADMIN = { href: '/admin', rotulo: 'Admin', Icone: ShieldCheck } as const;

/**
 * Pergunta ao servidor se esta conta é admin.
 *
 * A regra vive no `ADMIN_EMAIL` da API, não aqui: comparar email no navegador
 * colocaria a decisão onde qualquer um edita. O item de menu some quando a rota
 * responde 403 — e mesmo se alguém forçar a URL, a API recusa igual.
 */
function useEhAdmin() {
  const { data } = useQuery({
    queryKey: ['admin', 'status'],
    queryFn: () => apiFetch<{ admin: boolean }>('/admin/status'),
    retry: false,
    staleTime: Infinity,
  });
  return data?.admin === true;
}

/**
 * Casca do app.
 *
 * A navegação troca de lugar por tamanho de tela em vez de encolher: embaixo no
 * celular, onde o polegar alcança, e no topo no desktop, onde uma barra fixa
 * embaixo só rouba altura. Mesma lista, mesmas rotas — só o lugar muda.
 */
/**
 * Igualdade exata só serve para a raiz. Sem isto, `/planos/<id>` deixaria a
 * navegação inteira apagada — a professora perde a referência de onde está.
 */
function estaNaSecao(caminho: string, href: string) {
  return href === '/' ? caminho === '/' : caminho === href || caminho.startsWith(`${href}/`);
}

export function AppShell({
  titulo,
  descricao,
  acao,
  children,
}: {
  titulo: string;
  descricao?: string;
  acao?: React.ReactNode;
  children: React.ReactNode;
}) {
  const caminho = usePathname();
  const { pendentes } = useFilaOffline();
  // Admin entra só no topo: a barra do celular tem quatro dedos de largura, e
  // um quinto item espremeria a navegação que a professora usa todo dia por uma
  // que só existe para uma conta.
  const itens = useEhAdmin() ? [...ITENS, ADMIN] : ITENS;

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      {/*
        Registro parado no aparelho é coisa que ela precisa saber sem ter de
        procurar: some sozinho quando sobe, e enquanto está lá diz onde está o
        trabalho dela.
      */}
      {pendentes > 0 && (
        <div className="flex items-center justify-center gap-2 bg-amber-500/15 px-4 py-1.5 text-xs text-amber-700 dark:text-amber-400">
          <CloudOff className="size-3.5 shrink-0" aria-hidden />
          <span>
            {pendentes} registro(s) salvos no aparelho, aguardando rede
          </span>
        </div>
      )}
      <header className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold tracking-tight">{titulo}</h1>
            {descricao && (
              <p className="truncate text-xs text-muted-foreground">{descricao}</p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {/* Navegação de desktop, ao lado da ação. */}
            <nav className="hidden items-center gap-1 sm:flex">
              {itens.map(({ href, rotulo, Icone }) => (
                <Link
                  key={href}
                  href={href}
                  aria-current={estaNaSecao(caminho, href) ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    estaNaSecao(caminho, href)
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                >
                  <Icone className="size-4" aria-hidden />
                  {rotulo}
                </Link>
              ))}
            </nav>
            {acao}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-4 pb-24 sm:pb-8">{children}</main>

      {/* Navegação de celular. */}
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t bg-card sm:hidden">
        <div className="mx-auto flex max-w-4xl">
          {ITENS.map(({ href, rotulo, Icone }) => {
            const ativo = estaNaSecao(caminho, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={ativo ? 'page' : undefined}
                className={cn(
                  'flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors active:bg-accent',
                  ativo ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                <Icone className="size-5" aria-hidden />
                {rotulo}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

/** Estado vazio — texto que explica o próximo passo, não só "nada aqui". */
export function Vazio({
  titulo,
  descricao,
  acao,
}: {
  titulo: string;
  descricao: string;
  acao?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-10 text-center">
      <p className="font-medium">{titulo}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{descricao}</p>
      {acao && <div className="pt-2">{acao}</div>}
    </div>
  );
}
