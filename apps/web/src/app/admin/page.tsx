'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch } from '@/lib/api';
import { dataBR } from '@/lib/datas';
import { useRedirecionaSeDeslogado } from '@/lib/sessao';
import type { AdminProfessor, AdminResumo } from '@/lib/types';

const ultimo = (iso: string | null) => (iso ? dataBR(iso) : '—');

function Numero({ rotulo, valor, nota }: { rotulo: string; valor: string; nota?: string }) {
  return (
    <div className="rounded-md border bg-card px-3 py-2.5">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className="text-xl font-semibold tabular-nums">{valor}</p>
      {nota && <p className="text-xs text-muted-foreground">{nota}</p>}
    </div>
  );
}

/**
 * Painel macro, atrás do `AdminGuard` da API.
 *
 * Quem decide se você é admin é o servidor, pelo `ADMIN_EMAIL`. Esta tela só
 * pergunta e obedece: um 403 aqui vira "área restrita" e ponto — não existe
 * caminho em que o navegador se declare admin.
 */
export default function Admin() {
  const resumo = useQuery({
    queryKey: ['admin', 'resumo'],
    queryFn: () => apiFetch<AdminResumo>('/admin/resumo'),
    retry: false,
  });
  const professores = useQuery({
    queryKey: ['admin', 'professores'],
    queryFn: () => apiFetch<AdminProfessor[]>('/admin/professores'),
    retry: false,
    enabled: resumo.isSuccess,
  });

  useRedirecionaSeDeslogado(resumo.error);

  if (resumo.isError) {
    return (
      <AppShell titulo="Admin">
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Área restrita.
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  const r = resumo.data;

  return (
    <AppShell
      titulo="Admin"
      descricao="Visão macro de todas as contas"
      acao={
        <Button asChild size="sm" variant="outline">
          <Link href="/admin/erros">
            <AlertTriangle /> Erros
          </Link>
        </Button>
      }
    >
      <div className="space-y-5">
        {!r ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <>
            {r.erros.ultimas24h > 0 && (
              <Link
                href="/admin/erros"
                className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm"
              >
                <AlertTriangle className="size-4 text-destructive" aria-hidden />
                <span className="flex-1">
                  {r.erros.ultimas24h} erro{r.erros.ultimas24h > 1 ? 's' : ''} nas últimas 24h
                </span>
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
              </Link>
            )}

            <section className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Professores
              </h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Numero rotulo="Contas" valor={String(r.professores.total)} />
                <Numero
                  rotulo="Ativos"
                  valor={String(r.professores.ativos7d)}
                  nota="registraram em 7d"
                />
                <Numero rotulo="Novos" valor={String(r.professores.novos30)} nota="em 30 dias" />
                <Numero
                  rotulo="Com alarme"
                  valor={String(r.professores.comDevice)}
                  nota="aparelho inscrito"
                />
              </div>
            </section>

            <section className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Aulas
              </h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Numero rotulo="Cadeiras ativas" valor={String(r.aulas.cadeirasAtivas)} />
                <Numero rotulo="Já aconteceram" valor={String(r.aulas.jaAconteceram)} />
                <Numero rotulo="Registradas" valor={String(r.aulas.registradas)} />
                {/* A promessa do produto num número só: aula que passou e virou
                    registro. O resto desta tela é volume. */}
                <Numero
                  rotulo="Taxa de registro"
                  valor={r.aulas.taxaRegistro === null ? '—' : `${r.aulas.taxaRegistro}%`}
                  nota="do que já aconteceu"
                />
              </div>
            </section>
          </>
        )}

        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Por conta
          </h2>
          <Card>
            <CardContent className="p-0">
              {!professores.data ? (
                <div className="space-y-2 p-3">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">Professor</th>
                        <th className="px-2 py-2 text-right font-medium">Cadeiras</th>
                        <th className="px-2 py-2 text-right font-medium">Aulas</th>
                        <th className="px-2 py-2 text-right font-medium">Registros</th>
                        <th className="px-2 py-2 text-right font-medium">Aparelhos</th>
                        <th className="px-3 py-2 text-right font-medium">Último</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {professores.data.map((p) => (
                        <tr key={p.id}>
                          <td className="px-3 py-2">
                            <p className="font-medium">{p.nome}</p>
                            <p className="text-xs text-muted-foreground">{p.email}</p>
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">{p.cadeiras}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{p.ocorrencias}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{p.registros}</td>
                          <td className="px-2 py-2 text-right tabular-nums">
                            {p.devices === 0 ? (
                              <Badge variant="outline" className="font-normal">
                                nenhum
                              </Badge>
                            ) : (
                              p.devices
                            )}
                          </td>
                          <td className="px-3 py-2 text-right text-xs text-muted-foreground">
                            {ultimo(p.ultimoRegistroEm)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Sobre estes números</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            <p>
              &quot;Ativo&quot; é quem gravou um registro nos últimos 7 dias — não quem abriu o app.
              &quot;Taxa de registro&quot; ignora aula cancelada e feriado, e conta como registrada
              a aula que tem conteúdo escrito, revisado ou não.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
