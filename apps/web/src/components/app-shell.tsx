'use client';

import { useQuery } from '@tanstack/react-query';
import {
  BookOpen,
  CalendarDays,
  CloudOff,
  GraduationCap,
  Plug,
  Settings,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { baseDaApi, estaAlternada, EVENTO_BASE_API } from '@/lib/base-api';
import { useExigeSessao } from '@/lib/sessao';
import { useFilaOffline } from '@/lib/usar-fila';
import { cn } from '@/lib/utils';

const ITENS = [
  { href: '/', rotulo: 'Semana', Icone: CalendarDays },
  { href: '/progresso', rotulo: 'Progresso', Icone: TrendingUp },
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

function FaixaDaApi() {
  const [base, setBase] = useState<string | null>(null);

  // Só no cliente: lê localStorage, que não existe no SSR. E reage à troca — o
  // evento `storage` do navegador não dispara na aba que escreveu, então sem
  // isto a faixa só apareceria depois de recarregar.
  useEffect(() => {
    const ler = () => setBase(estaAlternada() ? baseDaApi() : null);
    ler();
    window.addEventListener(EVENTO_BASE_API, ler);
    return () => window.removeEventListener(EVENTO_BASE_API, ler);
  }, []);

  if (!base) return null;

  return (
    <div className="flex shrink-0 items-center justify-center gap-2 bg-alarme/15 px-4 py-1.5 text-xs text-alarme">
      <Plug className="size-3.5 shrink-0" aria-hidden />
      <span className="truncate">API alternada: {base}</span>
    </div>
  );
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
  /**
   * A casca É a fronteira de autenticação.
   *
   * Toda tela que exige login passa por aqui, e só o login e o cadastro ficam
   * de fora — então a checagem mora num lugar só, em vez de depender de cada
   * página lembrar. Não dá para ser middleware: o build do wrapper Android é
   * `output: 'export'`, que não tem servidor para rodar middleware nenhum.
   */
  const sessao = useExigeSessao();
  // Admin entra só no topo. A objeção nunca foi ao número de itens: é que a
  // barra do celular não vale ser gasta com uma tela que existe para UMA conta.
  // "Progresso" é o oposto — é semanal e é de todo mundo, então entra nas duas.
  const itens = useEhAdmin() ? [...ITENS, ADMIN] : ITENS;

  /**
   * Quem rola é o MAIN, não a página — e isso é por causa do iPhone.
   *
   * A barra de baixo era `fixed bottom-0`, que é o certo no papel e falha no
   * Safari: enquanto a barra do navegador encolhe durante a rolagem, o elemento
   * fixo é posicionado contra o viewport de LAYOUT (que não encolheu) e desliza
   * junto com o dedo, só assentando quando a rolagem para. Não há ajuste de
   * `fixed` que conserte isso — o que conserta é não ter nada fixo: a casca tem
   * a altura da tela, e a barra é só a última linha de um flex que nunca rola.
   *
   * `dvh` e não `vh` pelo mesmo motivo: `100vh` no iOS é a altura COM a barra
   * escondida, então a navegação ficaria fora da tela até alguém rolar.
   */
  const rolagem = useRef<HTMLElement>(null);

  // O Next rola a JANELA ao trocar de rota, e agora quem rola é outro elemento.
  // Sem isto, sair de uma lista longa para outra tela começaria no meio dela.
  useEffect(() => {
    rolagem.current?.scrollTo({ top: 0 });
  }, [caminho]);

  /**
   * Sem sessão, nada do app aparece — nem por um quadro.
   *
   * O `useExigeSessao` já mandou para o login; isto é o que ela vê no caminho.
   * Deixar `children` renderizar aqui era o defeito: as consultas da página
   * respondiam 401, o React Query devolvia `undefined`, e a tela desenhava o
   * estado VAZIO — "Nenhum plano de curso ainda" para quem só está deslogada.
   */
  if (sessao === 'ausente') {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-2 bg-background px-6 text-center">
        <p className="font-medium">Sua sessão terminou</p>
        <p className="text-sm text-muted-foreground">Levando você para a tela de entrada…</p>
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      {/*
        Registro parado no aparelho é coisa que ela precisa saber sem ter de
        procurar: some sozinho quando sobe, e enquanto está lá diz onde está o
        trabalho dela.
      */}
      {pendentes > 0 && (
        <div className="flex shrink-0 items-center justify-center gap-2 bg-amber-500/15 px-4 py-1.5 text-xs text-amber-700 dark:text-amber-400">
          <CloudOff className="size-3.5 shrink-0" aria-hidden />
          <span>
            {pendentes} registro(s) salvos no aparelho, aguardando rede
          </span>
        </div>
      )}
      {/*
        Apontando para outra API, isto fica na tela o tempo todo.

        Sem um aviso permanente, o desfecho previsível é conferir uma tela
        contra o ambiente errado e concluir que há um bug onde não há — ou pior,
        que não há onde há. O endereço vai escrito porque "alternado" sozinho
        ainda obriga a abrir os ajustes para saber para onde.
      */}
      <FaixaDaApi />
      {/* Sem `sticky`: o cabeçalho é uma linha do flex e nunca sai da tela. */}
      <header className="shrink-0 border-b bg-card">
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

      <main ref={rolagem} className="flex-1 overflow-y-auto overscroll-contain">
        {/* O padding embaixo some junto com o `fixed`: a barra não cobre mais
            nada, ela ocupa o próprio espaço. */}
        <div className="mx-auto w-full max-w-4xl px-4 py-4">{children}</div>
      </main>

      {/* Navegação de celular. */}
      <nav className="safe-bottom shrink-0 border-t bg-card sm:hidden">
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
