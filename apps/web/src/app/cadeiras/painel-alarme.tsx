'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, Info, Loader2, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { apiFetch } from '@/lib/api';
import { avisoDeDegradacao, type Capacidade } from '@/lib/capacidade';
import type { ConfigAlarmeResposta, IntensidadeAlarme } from '@/lib/types';
import { cn } from '@/lib/utils';

const INTENSIDADES: ReadonlyArray<{ valor: IntensidadeAlarme; rotulo: string }> = [
  { valor: 'SILENCIOSO', rotulo: 'Só no histórico' },
  { valor: 'NOTIFICACAO', rotulo: 'Notificação' },
  { valor: 'ALARME', rotulo: 'Alarme' },
];

const MINUTOS = [0, 5, 10, 15, 30];

/**
 * Configura os alarmes de uma cadeira.
 *
 * Duas regras de produto moram aqui:
 *
 * 1. **A tela avisa quando a escolha vai chegar rebaixada.** Marcar `ALARME`
 *    num iPhone não entrega alarme, e ela precisa saber disso no momento da
 *    escolha — não numa terça de manhã, quando o alarme não tocar.
 * 2. **A origem do valor fica visível.** "5 minutos" sozinho é ambíguo: ela não
 *    sabe se está mexendo numa cadeira ou em onze.
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
  // Qual campo está salvando — o spinner aparece no controle que ela mexeu, e
  // não numa barra global. Sem isso, mudar um select parece não ter efeito.
  const [salvando, setSalvando] = useState<string | null>(null);
  const [salvo, setSalvo] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['alarme', cadeiraId],
    queryFn: () => apiFetch<ConfigAlarmeResposta>(`/cadeiras/${cadeiraId}/alarme`),
    enabled: aberto,
  });

  const salvar = useMutation({
    mutationFn: ({ campo, valor }: { campo: string; valor: unknown }) => {
      setSalvando(campo);
      return apiFetch(`/cadeiras/${cadeiraId}/alarme`, {
        method: 'PUT',
        body: JSON.stringify({ [campo]: valor }),
      });
    },
    onSuccess: async (_r, { campo }) => {
      await qc.invalidateQueries({ queryKey: ['alarme', cadeiraId] });
      // Check verde por um instante: confirma que gravou sem exigir um toast a
      // cada mexida, que viraria ruído com seis controles na tela.
      setSalvo(campo);
      setTimeout(() => setSalvo((s) => (s === campo ? null : s)), 1600);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Não foi possível salvar.'),
    onSettled: () => setSalvando(null),
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
      <Button variant="ghost" size="sm" className="-ml-2" onClick={() => setAberto(true)}>
        <ChevronDown />
        Ajustar alarmes
      </Button>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="space-y-3 border-t pt-3">
        <Skeleton className="h-3 w-44" />
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-11 w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const { efetiva, override } = data;
  const temOverride = override !== null;

  // Um aviso só quando os dois coincidem — repetir o mesmo texto duas vezes
  // treina a pessoa a parar de ler avisos.
  const avisos = [
    ...new Set(
      [
        avisoDeDegradacao(efetiva.intensidadeAbertura, capacidade),
        avisoDeDegradacao(efetiva.intensidadeFechamento, capacidade),
      ].filter(Boolean),
    ),
  ] as string[];

  const Estado = ({ campo }: { campo: string }) => {
    if (salvando === campo) return <Loader2 className="size-3.5 animate-spin text-muted-foreground" />;
    if (salvo === campo) return <Check className="size-3.5 text-sucesso" />;
    return null;
  };

  return (
    <div className="space-y-4 border-t pt-4">
      <div className="flex items-center justify-between gap-2">
        <Badge variant={temOverride ? 'default' : 'neutro'}>
          {temOverride ? 'Ajustado nesta cadeira' : 'Usando o padrão da conta'}
        </Badge>
        <Button variant="ghost" size="sm" onClick={() => setAberto(false)}>
          Fechar
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <CampoSelect
          id={`ant-${cadeiraId}`}
          rotulo="Avisar antes da aula"
          valor={String(efetiva.antecedenciaMin)}
          onChange={(v) => salvar.mutate({ campo: 'antecedenciaMin', valor: Number(v) })}
          estado={<Estado campo="antecedenciaMin" />}
          opcoes={MINUTOS.map((m) => ({
            valor: String(m),
            rotulo: m === 0 ? 'Na hora exata' : `${m} minutos antes`,
          }))}
        />
        <CampoSelect
          id={`atr-${cadeiraId}`}
          rotulo="Avisar depois da aula"
          valor={String(efetiva.atrasoMin)}
          onChange={(v) => salvar.mutate({ campo: 'atrasoMin', valor: Number(v) })}
          estado={<Estado campo="atrasoMin" />}
          opcoes={MINUTOS.map((m) => ({
            valor: String(m),
            rotulo: m === 0 ? 'Assim que terminar' : `${m} minutos depois`,
          }))}
        />
        <CampoSelect
          id={`iab-${cadeiraId}`}
          rotulo="Como avisar na abertura"
          valor={efetiva.intensidadeAbertura}
          onChange={(v) => salvar.mutate({ campo: 'intensidadeAbertura', valor: v })}
          estado={<Estado campo="intensidadeAbertura" />}
          opcoes={INTENSIDADES.map((i) => ({ valor: i.valor, rotulo: i.rotulo }))}
        />
        <CampoSelect
          id={`ife-${cadeiraId}`}
          rotulo="Como avisar no fechamento"
          valor={efetiva.intensidadeFechamento}
          onChange={(v) => salvar.mutate({ campo: 'intensidadeFechamento', valor: v })}
          estado={<Estado campo="intensidadeFechamento" />}
          opcoes={INTENSIDADES.map((i) => ({ valor: i.valor, rotulo: i.rotulo }))}
        />
      </div>

      <div className="flex flex-wrap gap-x-8 gap-y-3">
        <CampoSwitch
          id={`som-${cadeiraId}`}
          rotulo="Com som"
          valor={efetiva.som}
          onChange={(v) => salvar.mutate({ campo: 'som', valor: v })}
          estado={<Estado campo="som" />}
        />
        <CampoSwitch
          id={`vib-${cadeiraId}`}
          rotulo="Com vibração"
          valor={efetiva.vibra}
          onChange={(v) => salvar.mutate({ campo: 'vibra', valor: v })}
          estado={<Estado campo="vibra" />}
        />
      </div>

      {avisos.map((a) => (
        <Alert key={a} variant="alarme">
          <Info aria-hidden />
          <AlertDescription>{a}</AlertDescription>
        </Alert>
      ))}

      {temOverride && (
        <Button variant="outline" size="sm" onClick={() => limpar.mutate()} loading={limpar.isPending}>
          <RotateCcw />
          Voltar ao padrão da conta
        </Button>
      )}
    </div>
  );
}

function CampoSelect({
  id,
  rotulo,
  valor,
  onChange,
  opcoes,
  estado,
}: {
  id: string;
  rotulo: string;
  valor: string;
  onChange: (v: string) => void;
  opcoes: ReadonlyArray<{ valor: string; rotulo: string }>;
  estado?: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex h-4 items-center gap-2">
        <Label htmlFor={id}>{rotulo}</Label>
        {estado}
      </div>
      <Select value={valor} onValueChange={onChange}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {opcoes.map((o) => (
            <SelectItem key={o.valor} value={o.valor}>
              {o.rotulo}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function CampoSwitch({
  id,
  rotulo,
  valor,
  onChange,
  estado,
}: {
  id: string;
  rotulo: string;
  valor: boolean;
  onChange: (v: boolean) => void;
  estado?: React.ReactNode;
}) {
  return (
    <div className={cn('flex items-center gap-2.5')}>
      <Switch id={id} checked={valor} onCheckedChange={onChange} />
      <Label htmlFor={id} className="cursor-pointer">
        {rotulo}
      </Label>
      {estado}
    </div>
  );
}
