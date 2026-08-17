'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronRight, History, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { AppShell, Vazio } from '@/components/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch } from '@/lib/api';
import { dataBR } from '@/lib/datas';
import { periodoLetivo } from '@/lib/periodo';
import { useRedirecionaSeDeslogado } from '@/lib/sessao';
import type { ProgressoCadeira } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * "Onde eu parei no 8º A?" — a resposta, para as onze turmas de uma vez.
 *
 * O número grande NÃO é a porcentagem. "55%" não diz o que fazer; "falta 1
 * tópico e há 3 aulas até 21/08" diz. A barra existe como referência de relance;
 * quem manda na hierarquia da tela é o aviso de ritmo.
 */
export default function Progresso() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['progresso'],
    queryFn: () => apiFetch<ProgressoCadeira[]>('/progresso'),
  });
  useRedirecionaSeDeslogado(error);

  const apertadas = (data ?? []).filter((c) => c.ritmo?.apertado).length;

  return (
    <AppShell
      titulo="Progresso"
      descricao={
        data ? (apertadas > 0 ? `${apertadas} turma(s) apertada(s)` : 'Nenhuma turma atrasada') : undefined
      }
      /*
        Histórico entra aqui e não na barra de navegação: "onde eu parei" e "o
        que eu dei" são a mesma pergunta por dois ângulos, e um sexto item
        espremeria a barra do celular sem ganhar nada.
      */
      acao={
        <Button asChild size="sm" variant="outline">
          <Link href="/historico">
            <History />
            Histórico
          </Link>
        </Button>
      }
    >
      <div className="space-y-3">
        {isLoading &&
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}

        {!isLoading && (data?.length ?? 0) === 0 && (
          <Vazio
            titulo="Nenhuma cadeira ativa"
            descricao="O progresso compara o que você registrou com o plano de curso da turma."
            acao={
              <Button asChild variant="outline">
                <Link href="/cadeiras">Ir para cadeiras</Link>
              </Button>
            }
          />
        )}

        {data?.map((c) => (
          <Cartao key={c.cadeiraId} c={c} />
        ))}
      </div>
    </AppShell>
  );
}

function Cartao({ c }: { c: ProgressoCadeira }) {
  const semPlano = c.percentual === null;

  return (
    <Card>
      <CardContent className="space-y-3 py-3">
        <div className="flex items-center gap-3">
          <span
            className="h-9 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: c.corHex }}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">
              {c.disciplina} · {c.turma}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {periodoLetivo(c.anoLetivo, c.semestre)}
              {c.irmas.length > 0 && ` · junto com ${c.irmas.map((i) => i.turma).join(', ')}`}
            </p>
          </div>
          {!semPlano && (
            <Button asChild size="sm" variant="ghost" className="shrink-0">
              <Link href={`/progresso/${c.cadeiraId}`}>
                Detalhe
                <ChevronRight />
              </Link>
            </Button>
          )}
        </div>

        {semPlano ? (
          // Sem denominador não há progresso a mostrar. Barra vazia aqui
          // pareceria atraso, quando o que falta é vincular um plano.
          <p className="text-xs text-muted-foreground">
            Sem plano de curso vinculado — não há com o que comparar.{' '}
            <Link href="/cadeiras" className="underline underline-offset-2">
              Vincular um plano
            </Link>
            {c.aulasRegistradas > 0 && ` · ${c.aulasRegistradas} aula(s) registrada(s)`}
          </p>
        ) : (
          <>
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="min-w-0 truncate">
                  {c.unidadeAtual ? (
                    <>
                      Em <strong className="font-medium">{c.unidadeAtual.titulo}</strong> —{' '}
                      {c.unidadeAtual.cobertos} de {c.unidadeAtual.total}
                    </>
                  ) : (
                    <strong className="font-medium text-sucesso">Plano concluído</strong>
                  )}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {c.cobertos}/{c.total}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn('h-full rounded-full', c.ritmo?.apertado ? 'bg-alarme' : 'bg-primary')}
                  style={{ width: `${c.percentual}%` }}
                />
              </div>
            </div>

            {/* O número que importa. Porcentagem não diz o que fazer. */}
            {c.ritmo && (
              <p
                className={cn(
                  'flex items-start gap-1.5 text-xs',
                  c.ritmo.apertado ? 'text-alarme' : 'text-muted-foreground',
                )}
              >
                {c.ritmo.apertado && <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />}
                <span>
                  {c.ritmo.topicosFaltando === 1
                    ? 'Falta 1 tópico'
                    : `Faltam ${c.ritmo.topicosFaltando} tópicos`}{' '}
                  e{' '}
                  {c.ritmo.aulasAte === 0
                    ? 'não há aula'
                    : c.ritmo.aulasAte === 1
                      ? 'há 1 aula'
                      : `há ${c.ritmo.aulasAte} aulas`}{' '}
                  até {dataBR(c.ritmo.dataFimPrevista)}.
                </span>
              </p>
            )}

            <p className="text-xs text-muted-foreground">
              {c.aulasRegistradas} aula(s) registrada(s)
              {c.ultimaAulaEm && ` · última em ${dataBR(c.ultimaAulaEm)}`}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
