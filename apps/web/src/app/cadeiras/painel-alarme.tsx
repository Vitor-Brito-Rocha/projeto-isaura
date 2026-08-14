'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { avisoDeDegradacao, type Capacidade } from '@/lib/capacidade';
import type { ConfigAlarmeResposta, IntensidadeAlarme } from '@/lib/types';
import { AvisoAlarme, Botao, Selecao } from '@/components/ui';

const INTENSIDADES: ReadonlyArray<{ valor: IntensidadeAlarme; rotulo: string }> = [
  { valor: 'SILENCIOSO', rotulo: 'Só no histórico' },
  { valor: 'NOTIFICACAO', rotulo: 'Notificação' },
  { valor: 'ALARME', rotulo: 'Alarme' },
];

/**
 * Configura os alarmes de uma cadeira.
 *
 * Duas regras de produto moram aqui:
 *
 * 1. **A tela avisa quando a escolha vai chegar rebaixada.** Marcar `ALARME`
 *    num iPhone não entrega alarme, e ela precisa saber disso no momento da
 *    escolha — não numa terça de manhã, quando o alarme não tocar.
 * 2. **A origem do valor fica visível.** "5 minutos" sozinho é ambíguo: ela não
 *    sabe se está mexendo numa cadeira ou em onze. Por isso o rótulo diz se o
 *    valor veio do padrão da conta ou de um ajuste desta cadeira.
 */
export function PainelAlarme({
  cadeiraId,
  capacidade,
}: {
  cadeiraId: string;
  capacidade: Capacidade;
}) {
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);

  const { data } = useQuery({
    queryKey: ['alarme', cadeiraId],
    queryFn: () => apiFetch<ConfigAlarmeResposta>(`/cadeiras/${cadeiraId}/alarme`),
    enabled: aberto,
  });

  const salvar = useMutation({
    mutationFn: (dados: Record<string, unknown>) =>
      apiFetch(`/cadeiras/${cadeiraId}/alarme`, { method: 'PUT', body: JSON.stringify(dados) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alarme', cadeiraId] });
      toast.success('Alarme atualizado.');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Não foi possível salvar.'),
  });

  const limpar = useMutation({
    mutationFn: () => apiFetch(`/cadeiras/${cadeiraId}/alarme`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alarme', cadeiraId] });
      toast.success('Voltou a usar os padrões da conta.');
    },
  });

  if (!aberto) {
    return (
      <button
        onClick={() => setAberto(true)}
        className="text-sm font-medium text-registro underline-offset-2 hover:underline"
      >
        Ajustar alarmes
      </button>
    );
  }

  if (!data) return <p className="text-xs text-slate-500">Carregando alarmes…</p>;

  const { efetiva, override } = data;
  const temOverride = override !== null;
  const origem = temOverride ? 'ajustado nesta cadeira' : 'padrão da conta';

  const avisoAbertura = avisoDeDegradacao(efetiva.intensidadeAbertura, capacidade);
  const avisoFechamento = avisoDeDegradacao(efetiva.intensidadeFechamento, capacidade);
  // Um aviso só quando os dois coincidem — repetir o mesmo texto duas vezes
  // treina a pessoa a parar de ler avisos.
  const avisos = [...new Set([avisoAbertura, avisoFechamento].filter(Boolean))] as string[];

  return (
    <div className="space-y-3 border-t border-slate-200 pt-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          Valores em uso: <strong>{origem}</strong>
        </p>
        <button
          onClick={() => setAberto(false)}
          className="text-xs text-slate-500 underline-offset-2 hover:underline"
        >
          Fechar
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Selecao
          label="Antes da aula"
          value={String(efetiva.antecedenciaMin)}
          onChange={(e) => salvar.mutate({ antecedenciaMin: Number(e.target.value) })}
          opcoes={[0, 5, 10, 15, 30].map((m) => ({
            valor: String(m),
            rotulo: m === 0 ? 'Na hora exata' : `${m} minutos antes`,
          }))}
        />
        <Selecao
          label="Depois da aula"
          value={String(efetiva.atrasoMin)}
          onChange={(e) => salvar.mutate({ atrasoMin: Number(e.target.value) })}
          opcoes={[0, 5, 10, 15, 30].map((m) => ({
            valor: String(m),
            rotulo: m === 0 ? 'Assim que terminar' : `${m} minutos depois`,
          }))}
        />
        <Selecao
          label="Aviso de abertura"
          value={efetiva.intensidadeAbertura}
          onChange={(e) => salvar.mutate({ intensidadeAbertura: e.target.value })}
          opcoes={INTENSIDADES}
        />
        <Selecao
          label="Aviso de fechamento"
          value={efetiva.intensidadeFechamento}
          onChange={(e) => salvar.mutate({ intensidadeFechamento: e.target.value })}
          opcoes={INTENSIDADES}
        />
      </div>

      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={efetiva.som}
            onChange={(e) => salvar.mutate({ som: e.target.checked })}
            className="h-4 w-4 accent-registro"
          />
          Com som
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={efetiva.vibra}
            onChange={(e) => salvar.mutate({ vibra: e.target.checked })}
            className="h-4 w-4 accent-registro"
          />
          Com vibração
        </label>
      </div>

      {avisos.map((a) => (
        <AvisoAlarme key={a} texto={a} />
      ))}

      {temOverride && (
        <Botao variante="secundario" onClick={() => limpar.mutate()} disabled={limpar.isPending}>
          Voltar ao padrão da conta
        </Botao>
      )}
    </div>
  );
}
