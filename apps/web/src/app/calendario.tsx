'use client';

import { addDays, isSameDay, isSameMonth, startOfMonth, startOfWeek } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { format } from 'date-fns';
import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { LinhaAula, estaAtrasada, foraDoAr, temRegistro } from '@/components/linha-aula';
import type { Ocorrencia } from '@/lib/types';
import { cn } from '@/lib/utils';

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/** Quantas bolinhas cabem numa célula de celular antes de virar "+N". */
const MAXIMO_PONTOS = 3;

/**
 * O mês inteiro de relance.
 *
 * A lista responde "o que eu tenho hoje"; o calendário responde "como está o
 * meu mês" — e, principalmente, **onde ficaram os buracos**. Com onze turmas, a
 * pergunta que não cabe na lista semanal é "que dia eu deixei de registrar", e
 * é ela que esta tela existe para responder.
 *
 * Dois sinais, e cada um responde uma pergunta diferente:
 *
 * - **a bolinha** é a cor da cadeira, porque cor é identidade em todo o resto do
 *   app, e está preenchida quando a aula já tem conteúdo escrito — ou seja,
 *   responde "eu escrevi?";
 * - **o número do dia** fica em cor de alarme quando alguma aula daquele dia já
 *   passou sem registro — responde "está atrasado?".
 *
 * Separados de propósito. Na primeira versão a bolinha preenchia tudo que "não
 * era pendência", e aula de amanhã aparecia cheia como se estivesse registrada.
 */
export function Calendario({
  mes,
  ocorrencias,
}: {
  /** Qualquer dia do mês exibido. */
  mes: Date;
  ocorrencias: Ocorrencia[];
}) {
  const [aberto, setAberto] = useState<string | null>(null);

  const porDia = new Map<string, Ocorrencia[]>();
  for (const oc of ocorrencias) {
    const dia = oc.data.slice(0, 10);
    porDia.set(dia, [...(porDia.get(dia) ?? []), oc]);
  }

  // Começa no domingo da semana em que o mês cai e vai 6 semanas: é a grade
  // mais alta possível, e altura fixa evita a página pular ao trocar de mês.
  const inicio = startOfWeek(startOfMonth(mes), { weekStartsOn: 0 });
  const celulas = Array.from({ length: 42 }, (_, i) => addDays(inicio, i));

  const doDia = aberto ? (porDia.get(aberto) ?? []) : [];

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-2 sm:p-3">
          <div className="grid grid-cols-7 gap-1">
            {DIAS.map((d) => (
              <div
                key={d}
                className="pb-1 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
              >
                {d}
              </div>
            ))}

            {celulas.map((dia) => {
              const iso = format(dia, 'yyyy-MM-dd');
              const aulas = porDia.get(iso) ?? [];
              const doMes = isSameMonth(dia, mes);
              const hoje = isSameDay(dia, new Date());
              const atrasadas = aulas.filter(estaAtrasada).length;

              return (
                <button
                  key={iso}
                  type="button"
                  // Dia sem aula não é alvo de toque: abrir um dia vazio só
                  // fecha a lista que ela estava lendo.
                  disabled={aulas.length === 0}
                  aria-pressed={aberto === iso}
                  aria-label={`${format(dia, "d 'de' MMMM", { locale: ptBR })}, ${aulas.length} aula(s)`}
                  onClick={() => setAberto((a) => (a === iso ? null : iso))}
                  className={cn(
                    'flex min-h-14 flex-col items-center gap-1 rounded-md border border-transparent p-1 transition-colors',
                    doMes ? 'text-foreground' : 'text-muted-foreground/40',
                    aulas.length > 0 && 'hover:bg-accent',
                    aberto === iso && 'border-primary bg-primary/5',
                    aulas.length === 0 && 'cursor-default',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-6 items-center justify-center rounded-full text-xs tabular-nums',
                      hoje && 'bg-primary font-semibold text-primary-foreground',
                      !hoje && atrasadas > 0 && doMes && 'font-semibold text-alarme',
                    )}
                  >
                    {dia.getDate()}
                  </span>

                  <span className="flex flex-wrap justify-center gap-0.5">
                    {aulas.slice(0, MAXIMO_PONTOS).map((oc) => (
                      <span
                        key={oc.id}
                        // Cancelada fica apagada: não é buraco a preencher, e
                        // vazada normal a faria parecer aula esquecida.
                        className={cn('size-1.5 rounded-full border', foraDoAr(oc) && 'opacity-40')}
                        style={{
                          borderColor: oc.cadeira.corHex,
                          backgroundColor: temRegistro(oc) ? oc.cadeira.corHex : 'transparent',
                        }}
                        aria-hidden
                      />
                    ))}
                    {aulas.length > MAXIMO_PONTOS && (
                      <span className="text-[9px] leading-none text-muted-foreground">
                        +{aulas.length - MAXIMO_PONTOS}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-muted-foreground" aria-hidden />
          já registrada
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full border border-muted-foreground" aria-hidden />
          ainda não
        </span>
        <span className="flex items-center gap-1.5">
          <span className="font-semibold text-alarme" aria-hidden>
            12
          </span>
          passou sem registro
        </span>
        <span>Toque num dia para ver as aulas.</span>
      </p>

      {aberto && (
        <section className="space-y-2">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {format(new Date(`${aberto}T12:00:00`), "EEEE, d 'de' MMMM", { locale: ptBR })}
          </h2>
          {doDia.map((oc) => (
            <LinhaAula key={oc.id} ocorrencia={oc} />
          ))}
        </section>
      )}
    </div>
  );
}
