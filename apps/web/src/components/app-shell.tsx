'use client';

import { BookOpen, CalendarDays, GraduationCap, Settings } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const ITENS = [
  { href: '/', rotulo: 'Semana', Icone: CalendarDays },
  { href: '/cadeiras', rotulo: 'Cadeiras', Icone: GraduationCap },
  { href: '/planos', rotulo: 'Planos', Icone: BookOpen },
  { href: '/config', rotulo: 'Ajustes', Icone: Settings },
] as const;

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

  return (
    <div className="flex min-h-dvh flex-col bg-background">
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
              {ITENS.map(({ href, rotulo, Icone }) => (
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
