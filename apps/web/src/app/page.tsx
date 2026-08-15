'use client';

import { useQuery } from '@tanstack/react-query';
import { addDays, format, isSameDay, startOfWeek } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { AppShell, Vazio } from '@/components/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch } from '@/lib/api';
import { useRedirecionaSeDeslogado } from '@/lib/sessao';
import type { Ocorrencia } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Pendencias } from './pendencias';

const iso = (d: Date) => format(d, 'yyyy-MM-dd');

export default function Semana() {
  const [offset, setOffset] = useState(0);

  const base = addDays(startOfWeek(new Date(), { weekStartsOn: 0 }), offset * 7);
  const de = iso(base);
  const ate = iso(addDays(base, 6));

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['agenda', de, ate],
    queryFn: () => apiFetch<Ocorrencia[]>(`/agenda?de=${de}&ate=${ate}`),
    // Mantém a semana anterior na tela durante a troca em vez de piscar o
    // esqueleto a cada seta — a navegação fica contínua.
    placeholderData: (anterior) => anterior,
  });

  useRedirecionaSeDeslogado(error);

  const porDia = new Map<string, Ocorrencia[]>();
  for (const oc of data ?? []) {
    const dia = oc.data.slice(0, 10);
    porDia.set(dia, [...(porDia.get(dia) ?? []), oc]);
  }

  const dias = Array.from({ length: 7 }, (_, i) => addDays(base, i));
  const temAula = dias.some((d) => (porDia.get(iso(d)) ?? []).length > 0);

  return (
    <AppShell
      titulo={offset === 0 ? 'Esta semana' : format(base, "d 'de' MMMM", { locale: ptBR })}
      descricao={`${format(base, "d 'de' MMM", { locale: ptBR })} – ${format(addDays(base, 6), "d 'de' MMM", { locale: ptBR })}`}
      acao={
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" onClick={() => setOffset((o) => o - 1)} aria-label="Semana anterior">
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setOffset(0)} disabled={offset === 0}>
            Hoje
          </Button>
          <Button variant="outline" size="icon" onClick={() => setOffset((o) => o + 1)} aria-label="Próxima semana">
            <ChevronRight />
          </Button>
        </div>
      }
    >
      {/* Barra fina de atividade — mostra que a troca de semana está em curso
          sem trocar o conteúdo por esqueleto. */}
      <div className="h-0.5" aria-hidden>
        {isFetching && !isLoading && <div className="h-0.5 animate-pulse rounded-full bg-primary/40" />}
      </div>

      {/* Fora do ramo de carregamento e do estado vazio de propósito: pendência
          de três semanas atrás não some porque ESTA semana está vazia. */}
      <Pendencias />

      {isLoading ? (
        <EsqueletoSemana />
      ) : !temAula ? (
        <Vazio
          titulo="Nenhuma aula nesta semana"
          descricao="Cadastre uma cadeira e os horários dela para a grade aparecer aqui."
          acao={
            // `Link` e não `<a>`: com âncora crua a navegação recarrega o app
            // inteiro e perde o cache do React Query.
            <Button asChild variant="outline">
              <Link href="/cadeiras">Ir para cadeiras</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-5">
          {dias.map((dia) => {
            const aulas = porDia.get(iso(dia)) ?? [];
            if (aulas.length === 0) return null;
            const hoje = isSameDay(dia, new Date());

            return (
              <section key={iso(dia)} className="space-y-2">
                <h2
                  className={cn(
                    'flex items-center gap-2 text-xs font-semibold uppercase tracking-wider',
                    hoje ? 'text-primary' : 'text-muted-foreground',
                  )}
                >
                  {format(dia, "EEEE, d 'de' MMMM", { locale: ptBR })}
                  {hoje && <Badge>hoje</Badge>}
                </h2>

                <div className="space-y-2">
                  {aulas.map((oc) => (
                    <LinhaAula key={oc.id} ocorrencia={oc} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}

function LinhaAula({ ocorrencia: oc }: { ocorrencia: Ocorrencia }) {
  const cancelada = oc.status === 'CANCELADA' || oc.status === 'FERIADO';

  return (
    <Card
      className={cn(
        'flex items-center gap-3 p-3 transition-colors hover:bg-accent/40',
        cancelada && 'opacity-60',
      )}
    >
      <span
        className="h-11 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: oc.cadeira.corHex }}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className={cn('truncate font-medium', cancelada && 'line-through')}>
          {oc.cadeira.disciplina} · {oc.cadeira.turma}
        </p>
        <p className="tabular text-sm text-muted-foreground">
          {oc.horaInicio} – {oc.horaFim}
        </p>
      </div>
      <EtiquetaEstado ocorrencia={oc} />
    </Card>
  );
}

/** O estado da aula em uma palavra — é o que ela precisa ver de relance. */
function EtiquetaEstado({ ocorrencia: oc }: { ocorrencia: Ocorrencia }) {
  if (oc.status === 'CANCELADA') return <Badge variant="neutro">Cancelada</Badge>;
  if (oc.status === 'FERIADO') return <Badge variant="neutro">Feriado</Badge>;
  if (oc.registro?.conteudoDado) return <Badge variant="sucesso">Registrada</Badge>;
  if (oc.registro?.planoPrevisto) return <Badge>Planejada</Badge>;
  // Aula que já passou sem registro é exatamente o que o produto existe para
  // evitar — por isso ganha a cor de alarme.
  if (new Date(oc.fimEm) < new Date()) return <Badge variant="alarme">Sem registro</Badge>;
  return null;
}

function EsqueletoSemana() {
  return (
    <div className="space-y-5">
      {[3, 2].map((quantas, i) => (
        <section key={i} className="space-y-2">
          <Skeleton className="h-3 w-40" />
          <div className="space-y-2">
            {Array.from({ length: quantas }).map((_, j) => (
              <Card key={j} className="flex items-center gap-3 p-3">
                <Skeleton className="h-11 w-1.5 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/5" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-5 w-20 rounded-full" />
              </Card>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
