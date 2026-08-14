'use client';

import { useQuery } from '@tanstack/react-query';
import { addDays, format, startOfWeek } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import type { Ocorrencia } from '@/lib/types';
import { Botao, Cabecalho, Cartao, Navegacao } from '@/components/ui';

const iso = (d: Date) => format(d, 'yyyy-MM-dd');

export default function Semana() {
  const router = useRouter();
  const [offsetSemanas, setOffsetSemanas] = useState(0);

  const base = addDays(startOfWeek(new Date(), { weekStartsOn: 0 }), offsetSemanas * 7);
  const de = iso(base);
  const ate = iso(addDays(base, 6));

  const { data, isLoading, error } = useQuery({
    queryKey: ['agenda', de, ate],
    queryFn: () => apiFetch<Ocorrencia[]>(`/agenda?de=${de}&ate=${ate}`),
  });

  // Sessão expirada volta para o login em vez de deixar a tela vazia — sem
  // isto, a professora vê "nenhuma aula" e conclui que perdeu os dados.
  useEffect(() => {
    if (error instanceof ApiError && error.status === 401) router.push('/login');
  }, [error, router]);

  const porDia = new Map<string, Ocorrencia[]>();
  for (const oc of data ?? []) {
    const dia = oc.data.slice(0, 10);
    porDia.set(dia, [...(porDia.get(dia) ?? []), oc]);
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <Cabecalho
        titulo={offsetSemanas === 0 ? 'Esta semana' : format(base, "'Semana de' d 'de' MMMM", { locale: ptBR })}
        acao={
          <div className="flex gap-1">
            <Botao variante="secundario" onClick={() => setOffsetSemanas((o) => o - 1)} aria-label="Semana anterior">
              ←
            </Botao>
            <Botao variante="secundario" onClick={() => setOffsetSemanas(0)} disabled={offsetSemanas === 0}>
              Hoje
            </Botao>
            <Botao variante="secundario" onClick={() => setOffsetSemanas((o) => o + 1)} aria-label="Próxima semana">
              →
            </Botao>
          </div>
        }
      />

      <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 p-4">
        {isLoading && <p className="text-sm text-slate-500">Carregando a grade…</p>}

        {!isLoading && (data?.length ?? 0) === 0 && (
          <Cartao className="text-center">
            <p className="text-sm text-slate-600">Nenhuma aula nesta semana.</p>
            <p className="mt-1 text-xs text-slate-500">
              Cadastre uma cadeira e os horários dela para a grade aparecer aqui.
            </p>
          </Cartao>
        )}

        {Array.from({ length: 7 }, (_, i) => addDays(base, i)).map((dia) => {
          const aulas = porDia.get(iso(dia)) ?? [];
          if (aulas.length === 0) return null;

          return (
            <section key={iso(dia)} className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                {format(dia, "EEEE, d 'de' MMMM", { locale: ptBR })}
              </h2>
              {aulas.map((oc) => (
                <Cartao key={oc.id} className="flex items-center gap-3">
                  <span
                    className="h-10 w-1 shrink-0 rounded-full"
                    style={{ backgroundColor: oc.cadeira.corHex }}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">
                      {oc.cadeira.disciplina} · {oc.cadeira.turma}
                    </p>
                    <p className="text-sm tabular-nums text-slate-600">
                      {oc.horaInicio} – {oc.horaFim}
                    </p>
                  </div>
                  <Etiqueta ocorrencia={oc} />
                </Cartao>
              ))}
            </section>
          );
        })}
      </main>

      <Navegacao />
    </div>
  );
}

/** Estado da aula em uma palavra — é o que ela precisa ver de relance. */
function Etiqueta({ ocorrencia }: { ocorrencia: Ocorrencia }) {
  if (ocorrencia.status === 'CANCELADA') {
    return <span className="text-xs font-medium text-slate-500">Cancelada</span>;
  }
  if (ocorrencia.status === 'FERIADO') {
    return <span className="text-xs font-medium text-slate-500">Feriado</span>;
  }
  if (ocorrencia.registro?.conteudoDado) {
    return <span className="text-xs font-semibold text-emerald-700">Registrada</span>;
  }
  if (ocorrencia.registro?.planoPrevisto) {
    return <span className="text-xs font-medium text-registro">Planejada</span>;
  }
  // Aula que já passou e não tem registro é o que o produto existe para evitar.
  if (new Date(ocorrencia.fimEm) < new Date()) {
    return <span className="text-xs font-semibold text-alarme">Sem registro</span>;
  }
  return null;
}
