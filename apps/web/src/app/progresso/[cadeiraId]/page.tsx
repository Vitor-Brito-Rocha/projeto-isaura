'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Check } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch } from '@/lib/api';
import { dataBR } from '@/lib/datas';
import { periodoLetivo } from '@/lib/periodo';
import { useRedirecionaSeDeslogado } from '@/lib/sessao';
import type { ProgressoDetalhe } from '@/lib/types';

/**
 * Unidade a unidade, com o que ainda falta dar.
 *
 * A lista de tópicos faltando é o ponto: ela responde "o que eu dou na próxima"
 * sem ela ter de cruzar o plano de curso com o histórico de cabeça. É o mesmo
 * dado que alimenta a barra da tela anterior, aberto.
 */
export default function ProgressoDaCadeira() {
  const { cadeiraId } = useParams<{ cadeiraId: string }>();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['progresso', cadeiraId],
    queryFn: () => apiFetch<ProgressoDetalhe>(`/progresso/${cadeiraId}`),
    enabled: Boolean(cadeiraId),
  });
  useRedirecionaSeDeslogado(error);

  const voltar = (
    <Button asChild size="sm" variant="outline">
      <Link href="/progresso">
        <ArrowLeft /> Progresso
      </Link>
    </Button>
  );

  if (isLoading) {
    return (
      <AppShell titulo="Progresso" acao={voltar}>
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </AppShell>
    );
  }

  if (isError || !data) {
    return (
      <AppShell titulo="Progresso" acao={voltar}>
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            {error instanceof Error ? error.message : 'Não foi possível abrir esta turma.'}
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  const { resumo, unidades } = data;

  return (
    <AppShell
      titulo={`${resumo.disciplina} · ${resumo.turma}`}
      descricao={`${periodoLetivo(resumo.anoLetivo, resumo.semestre)} · ${resumo.cobertos} de ${resumo.total} tópicos`}
      acao={voltar}
    >
      <div className="space-y-3">
        {resumo.irmas.length > 0 && (
          <p className="px-1 text-xs text-muted-foreground">
            Mesmo plano de{' '}
            {resumo.irmas.map((i, n) => (
              <span key={i.cadeiraId}>
                {n > 0 && ', '}
                <Link href={`/progresso/${i.cadeiraId}`} className="underline underline-offset-2">
                  {i.turma}
                </Link>
              </span>
            ))}
            .
          </p>
        )}

        {unidades.map((u) => (
          <Card key={u.id}>
            <CardContent className="space-y-2 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-medium">{u.titulo}</span>
                {u.concluida ? (
                  <Badge variant="sucesso">
                    <Check className="mr-1 size-3" aria-hidden />
                    feita
                  </Badge>
                ) : (
                  <Badge variant="neutro">
                    {u.cobertos}/{u.total}
                  </Badge>
                )}
              </div>

              {u.dataFimPrevista && (
                <p className="text-xs text-muted-foreground">
                  Prevista até {dataBR(u.dataFimPrevista)}
                </p>
              )}

              {u.total === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Esta unidade não tem tópicos cadastrados —{' '}
                  <Link
                    href={`/planos/${resumo.plano?.id ?? ''}`}
                    className="underline underline-offset-2"
                  >
                    cadastre no plano
                  </Link>{' '}
                  para ela entrar na conta.
                </p>
              ) : (
                u.faltando.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Ainda falta dar:</p>
                    <ul className="flex flex-wrap gap-1.5">
                      {u.faltando.map((t) => (
                        <li
                          key={t.id}
                          className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground"
                        >
                          {t.titulo}
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              )}
            </CardContent>
          </Card>
        ))}

        <p className="px-1 text-xs text-muted-foreground">
          Conta só o que você revisou e salvou. Rascunho da IA não entra — o número aqui pode ir
          parar na frente da coordenação.
        </p>
      </div>
    </AppShell>
  );
}
