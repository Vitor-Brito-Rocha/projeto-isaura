'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Smartphone, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AppShell, Vazio } from '@/components/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch } from '@/lib/api';
import { detectarCapacidade, rotuloCapacidade, type Capacidade } from '@/lib/capacidade';
import { useRedirecionaSeDeslogado } from '@/lib/sessao';
import type { Cadeira, PlanoCurricular } from '@/lib/types';
import { PainelAlarme } from './painel-alarme';

export default function Cadeiras() {
  const qc = useQueryClient();
  const [criando, setCriando] = useState(false);
  const [capacidade, setCapacidade] = useState<Capacidade | null>(null);

  // Só no cliente: a detecção lê navigator/matchMedia, que não existem no SSR.
  useEffect(() => setCapacidade(detectarCapacidade()), []);

  const { data: cadeiras, isLoading, error } = useQuery({
    queryKey: ['cadeiras'],
    queryFn: () => apiFetch<Cadeira[]>('/cadeiras'),
  });
  useRedirecionaSeDeslogado(error);

  const { data: planos } = useQuery({
    queryKey: ['planos'],
    queryFn: () => apiFetch<PlanoCurricular[]>('/planos'),
  });

  const vincular = useMutation({
    mutationFn: ({ id, planoCurricularId }: { id: string; planoCurricularId: string | null }) =>
      apiFetch(`/cadeiras/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ planoCurricularId }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cadeiras'] });
      qc.invalidateQueries({ queryKey: ['planos'] });
      toast.success('Plano da turma atualizado.');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Não foi possível vincular.'),
  });

  const criar = useMutation({
    mutationFn: (dados: { disciplina: string; turma: string; anoLetivo: number }) =>
      apiFetch('/cadeiras', { method: 'POST', body: JSON.stringify(dados) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cadeiras'] });
      setCriando(false);
      toast.success('Cadeira criada.');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Não foi possível criar.'),
  });

  return (
    <AppShell
      titulo="Cadeiras"
      descricao={cadeiras ? `${cadeiras.length} cadastrada(s)` : undefined}
      acao={
        <Button
          size="sm"
          variant={criando ? 'outline' : 'default'}
          onClick={() => setCriando((v) => !v)}
        >
          {criando ? <X /> : <Plus />}
          {criando ? 'Cancelar' : 'Nova'}
        </Button>
      }
    >
      <div className="space-y-3">
        {capacidade && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Smartphone className="size-3.5" aria-hidden />
            Neste aparelho: <strong className="font-medium text-foreground">{rotuloCapacidade(capacidade)}</strong>
          </p>
        )}

        {criando && (
          <FormularioCadeira onEnviar={(d) => criar.mutate(d)} enviando={criar.isPending} />
        )}

        {isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i}>
                <CardHeader className="flex-row items-center gap-3">
                  <Skeleton className="h-9 w-1.5 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-2/5" />
                    <Skeleton className="h-3 w-1/4" />
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}

        {!isLoading && (cadeiras?.length ?? 0) === 0 && !criando && (
          <Vazio
            titulo="Nenhuma cadeira ainda"
            descricao="Cada cadeira é uma disciplina numa turma — por exemplo, Matemática no 8º A."
            acao={
              <Button onClick={() => setCriando(true)}>
                <Plus />
                Criar a primeira
              </Button>
            }
          />
        )}

        {cadeiras?.map((c) => (
          <Card key={c.id}>
            <CardHeader className="flex-row items-center gap-3 space-y-0">
              <span
                className="h-9 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: c.corHex }}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <CardTitle className="truncate text-base">
                  {c.disciplina} · {c.turma}
                </CardTitle>
                <p className="truncate text-xs text-muted-foreground">
                  {c.anoLetivo}
                  {c.escola ? ` · ${c.escola.nome}` : ''}
                </p>
              </div>
              {c._count && (
                <Badge variant={c._count.series > 0 ? 'neutro' : 'alarme'}>
                  {c._count.series > 0
                    ? `${c._count.series} horário(s)`
                    : 'sem horário'}
                </Badge>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor={`plano-${c.id}`}>Plano de curso</Label>
                {/* Select nativo: no celular abre a roleta do SO, mais rápida
                    de acertar com o polegar do que uma lista customizada. */}
                <select
                  id={`plano-${c.id}`}
                  value={c.planoCurricularId ?? ''}
                  disabled={vincular.isPending || (planos?.length ?? 0) === 0}
                  onChange={(e) =>
                    vincular.mutate({ id: c.id, planoCurricularId: e.target.value || null })
                  }
                  className="flex h-11 w-full rounded-md border border-input bg-card px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
                >
                  <option value="">— sem plano —</option>
                  {planos?.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
                </select>
                {(planos?.length ?? 0) === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Nenhum plano cadastrado ainda —{' '}
                    <Link href="/planos" className="underline underline-offset-2">
                      crie um
                    </Link>{' '}
                    para o fechamento da aula ter unidade para escolher.
                  </p>
                ) : (
                  !c.planoCurricularId && (
                    <p className="text-xs text-muted-foreground">
                      Sem plano, o fechamento desta turma não registra unidade — e o progresso dela
                      não entra na comparação.
                    </p>
                  )
                )}
              </div>

              <PainelAlarme cadeiraId={c.id} capacidade={capacidade ?? 'SEM_SUPORTE'} />
            </CardContent>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}

function FormularioCadeira({
  onEnviar,
  enviando,
}: {
  onEnviar: (d: { disciplina: string; turma: string; anoLetivo: number }) => void;
  enviando: boolean;
}) {
  const [disciplina, setDisciplina] = useState('');
  const [turma, setTurma] = useState('');
  const [anoLetivo, setAnoLetivo] = useState(new Date().getFullYear());

  return (
    <Card>
      <CardContent className="pt-4 sm:pt-5">
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            onEnviar({ disciplina, turma, anoLetivo });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="disciplina">Disciplina</Label>
            <Input
              id="disciplina"
              required
              autoFocus
              value={disciplina}
              onChange={(e) => setDisciplina(e.target.value)}
              placeholder="Matemática"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="turma">Turma</Label>
            <Input
              id="turma"
              required
              value={turma}
              onChange={(e) => setTurma(e.target.value)}
              placeholder="8º A"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ano">Ano letivo</Label>
            <Input
              id="ano"
              type="number"
              required
              value={anoLetivo}
              onChange={(e) => setAnoLetivo(Number(e.target.value))}
            />
          </div>
          <div className="flex items-end">
            <Button type="submit" loading={enviando} className="w-full">
              Criar cadeira
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
