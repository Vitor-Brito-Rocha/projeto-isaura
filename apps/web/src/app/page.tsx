'use client';

import { useQuery } from '@tanstack/react-query';
import { addDays, addMonths, format, isSameDay, startOfMonth, startOfWeek } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarDays, ChevronLeft, ChevronRight, List } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AppShell, Vazio } from '@/components/app-shell';
import { LinhaAula } from '@/components/linha-aula';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch } from '@/lib/api';
import { useRedirecionaSeDeslogado } from '@/lib/sessao';
import type { Ocorrencia } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Calendario } from './calendario';
import { Pendencias } from './pendencias';

const iso = (d: Date) => format(d, 'yyyy-MM-dd');

type Modo = 'lista' | 'calendario';
const CHAVE_MODO = 'isaura:modo-grade';

/**
 * A grade, em lista ou em calendário.
 *
 * A lista responde "o que eu tenho hoje" e é o padrão porque é a pergunta de
 * toda manhã. O calendário responde "como está o meu mês" e, sobretudo, "que
 * dia eu deixei de registrar" — com onze turmas, essa segunda pergunta não cabe
 * numa semana por vez.
 *
 * A escolha fica guardada no aparelho: quem prefere o mês não deveria ter de
 * dizer isso toda vez que abre o app.
 */
export default function Semana() {
  const [modo, setModo] = useState<Modo>('lista');
  const [offset, setOffset] = useState(0);

  // Só no cliente: `localStorage` não existe no SSR, e ler no `useState` faria
  // a marcação do servidor divergir da do navegador.
  useEffect(() => {
    if (localStorage.getItem(CHAVE_MODO) === 'calendario') setModo('calendario');
  }, []);

  const trocarModo = (m: Modo) => {
    setModo(m);
    setOffset(0);
    localStorage.setItem(CHAVE_MODO, m);
  };

  const calendario = modo === 'calendario';
  const mes = addMonths(new Date(), offset);
  const base = addDays(startOfWeek(new Date(), { weekStartsOn: 0 }), offset * 7);

  // O calendário precisa das semanas que "vazam" do mês para as bordas da
  // grade: sem elas, os dias de outro mês na primeira e na última linha
  // apareceriam sempre vazios, como se ela não tivesse aula neles.
  const de = calendario ? iso(startOfWeek(startOfMonth(mes), { weekStartsOn: 0 })) : iso(base);
  const ate = calendario
    ? iso(addDays(startOfWeek(startOfMonth(mes), { weekStartsOn: 0 }), 41))
    : iso(addDays(base, 6));

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['agenda', de, ate],
    queryFn: () => apiFetch<Ocorrencia[]>(`/agenda?de=${de}&ate=${ate}`),
    // Mantém o período anterior na tela durante a troca em vez de piscar o
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
  const temAula = calendario
    ? (data?.length ?? 0) > 0
    : dias.some((d) => (porDia.get(iso(d)) ?? []).length > 0);

  const titulo = calendario
    ? format(mes, 'MMMM', { locale: ptBR })
    : offset === 0
      ? 'Esta semana'
      : format(base, "d 'de' MMMM", { locale: ptBR });

  const descricao = calendario
    ? format(mes, 'yyyy')
    : `${format(base, "d 'de' MMM", { locale: ptBR })} – ${format(addDays(base, 6), "d 'de' MMM", { locale: ptBR })}`;

  return (
    <AppShell
      titulo={titulo}
      descricao={descricao}
      acao={
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setOffset((o) => o - 1)}
            aria-label={calendario ? 'Mês anterior' : 'Semana anterior'}
          >
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setOffset(0)} disabled={offset === 0}>
            Hoje
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setOffset((o) => o + 1)}
            aria-label={calendario ? 'Próximo mês' : 'Próxima semana'}
          >
            <ChevronRight />
          </Button>
        </div>
      }
    >
      <div className="mb-3 flex items-center gap-1">
        <Button
          variant={calendario ? 'ghost' : 'default'}
          size="sm"
          aria-pressed={!calendario}
          onClick={() => trocarModo('lista')}
        >
          <List />
          Lista
        </Button>
        <Button
          variant={calendario ? 'default' : 'ghost'}
          size="sm"
          aria-pressed={calendario}
          onClick={() => trocarModo('calendario')}
        >
          <CalendarDays />
          Calendário
        </Button>
      </div>

      {/* Barra fina de atividade — mostra que a troca de período está em curso
          sem trocar o conteúdo por esqueleto. */}
      <div className="h-0.5" aria-hidden>
        {isFetching && !isLoading && <div className="h-0.5 animate-pulse rounded-full bg-primary/40" />}
      </div>

      {/* Fora do ramo de carregamento e do estado vazio de propósito: pendência
          de três semanas atrás não some porque ESTA semana está vazia. */}
      <Pendencias />

      {isLoading ? (
        <EsqueletoSemana />
      ) : calendario ? (
        <Calendario mes={mes} ocorrencias={data ?? []} />
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
