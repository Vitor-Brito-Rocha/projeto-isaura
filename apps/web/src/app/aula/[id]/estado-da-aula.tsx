'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarOff, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Confirmar } from '@/components/confirmar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api';
import { dataBR, diaEDataBR } from '@/lib/datas';
import type { ContextoAula, StatusOcorrencia } from '@/lib/types';

interface Transferencia {
  ok: boolean;
  motivo?: 'sem-plano' | 'sem-proxima';
  ocorrenciaId?: string;
  data?: string;
  substituiu?: boolean;
}

/**
 * A aula não aconteceu.
 *
 * Uma agenda escolar tem mais exceção do que regra — feriado, conselho de
 * classe, semana de prova, professor de licença. Sem esta seção, a aula
 * cancelada fica na grade como pendência para sempre e o alarme toca para uma
 * aula que não existe.
 *
 * A peça de produto aqui é a **transferência do plano**: a aula caiu, o
 * conteúdo não. Se ela planejou "soma de frações" para terça e a terça virou
 * reunião, quinta é onde isso vai acontecer — e reescrever à mão o que já
 * estava escrito é o retrabalho que torna onze cadeiras insustentáveis.
 */
export function EstadoDaAula({
  ocorrenciaId,
  contexto,
}: {
  ocorrenciaId: string;
  contexto: ContextoAula;
}) {
  const qc = useQueryClient();
  const [levarPlano, setLevarPlano] = useState(true);

  const status = contexto.ocorrencia.status;
  const foraDoAr = status === 'CANCELADA' || status === 'FERIADO';
  const plano = contexto.registro?.planoPrevisto?.trim();
  const proxima = contexto.proximasAulas?.[0];
  const podeTransferir = Boolean(plano && proxima);

  const mudar = useMutation({
    mutationFn: (corpo: { status: StatusOcorrencia; transferirPlano?: boolean }) =>
      apiFetch<{ transferencia: Transferencia | null }>(`/agenda/${ocorrenciaId}`, {
        method: 'PATCH',
        body: JSON.stringify(corpo),
      }),
    onSuccess: async (r, corpo) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['contexto', ocorrenciaId] }),
        qc.invalidateQueries({ queryKey: ['agenda'] }),
        qc.invalidateQueries({ queryKey: ['pendencias'] }),
        qc.invalidateQueries({ queryKey: ['progresso'] }),
      ]);

      if (corpo.status === 'AGENDADA') return toast.success('Aula de volta à grade.');

      const t = r.transferencia;
      if (t?.ok && t.data) {
        toast.success(`Aula cancelada. O plano foi para ${dataBR(t.data)}.`, {
          description: t.substituiu ? 'O plano que estava lá foi substituído.' : undefined,
        });
      } else if (t?.motivo === 'sem-proxima') {
        toast.warning('Aula cancelada. Não há próxima aula desta turma para levar o plano.');
      } else {
        toast.success('Aula cancelada.');
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Não foi possível mudar o estado.'),
  });

  if (foraDoAr) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed bg-muted/30 px-3 py-2">
        <Badge variant="neutro">{status === 'FERIADO' ? 'Feriado' : 'Aula cancelada'}</Badge>
        <span className="min-w-0 flex-1 text-xs text-muted-foreground">
          Não conta como pendência e não dispara alarme.
        </span>
        <Confirmar
          titulo="Devolver esta aula à grade?"
          descricao="Ela volta a contar como pendência e os dois alarmes voltam a tocar."
          rotuloAcao="Devolver"
          carregando={mudar.isPending}
          onConfirmar={() => mudar.mutate({ status: 'AGENDADA' })}
        >
          <Button size="sm" variant="outline">
            <RotateCcw />
            Desfazer
          </Button>
        </Confirmar>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-t pt-3">
      <span className="text-xs text-muted-foreground">Esta aula não aconteceu?</span>

      <Confirmar
        titulo="Cancelar esta aula?"
        perigo
        rotuloAcao="Cancelar aula"
        rotuloCancelar="Voltar"
        carregando={mudar.isPending}
        onConfirmar={() => mudar.mutate({ status: 'CANCELADA', transferirPlano: levarPlano })}
        descricao={
          <div className="space-y-2">
            <p>
              Ela sai das pendências e os dois alarmes param. O que você já escreveu fica guardado.
            </p>

            {podeTransferir ? (
              <label className="flex cursor-pointer items-start gap-2 rounded-md border bg-muted/40 p-2">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 shrink-0"
                  checked={levarPlano}
                  onChange={(e) => setLevarPlano(e.target.checked)}
                />
                <span className="text-sm">
                  Levar o plano para <strong>{diaEDataBR(proxima!.data)}</strong>
                  {/* Avisa ANTES, porque sobrescrever em silêncio o que ela
                      escreveu é o acidente que esta caixa existe para evitar. */}
                  {proxima!.temPlano && (
                    <span className="mt-0.5 block text-xs text-destructive">
                      Essa aula já tem plano escrito — ele será substituído.
                    </span>
                  )}
                </span>
              </label>
            ) : plano ? (
              <p className="text-xs text-muted-foreground">
                Não há próxima aula desta turma na grade, então o plano fica só aqui.
              </p>
            ) : null}
          </div>
        }
      >
        <Button size="sm" variant="outline">
          <CalendarOff />
          Cancelar aula
        </Button>
      </Confirmar>

      <Confirmar
        titulo="Marcar como feriado?"
        descricao="Mesmo efeito de cancelar: sai das pendências e os alarmes param."
        rotuloAcao="Marcar feriado"
        carregando={mudar.isPending}
        onConfirmar={() => mudar.mutate({ status: 'FERIADO', transferirPlano: levarPlano })}
      >
        <Button size="sm" variant="ghost">
          Feriado
        </Button>
      </Confirmar>
    </div>
  );
}
