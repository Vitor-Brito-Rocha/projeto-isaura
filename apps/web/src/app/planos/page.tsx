'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Plus, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { AppShell, Vazio } from '@/components/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { CampoPeriodo } from '@/components/campo-periodo';
import { apiFetch } from '@/lib/api';
import { periodoLetivo, semestreDoCampo } from '@/lib/periodo';
import { useRedirecionaEmErro } from '@/lib/sessao';
import type { PlanoCurricular } from '@/lib/types';

/**
 * O currículo, separado das turmas.
 *
 * Um plano é criado uma vez por disciplina e apontado por quantas turmas
 * quiser — é isso que evita digitar o mesmo conteúdo de Matemática uma vez para
 * cada uma das turmas e corrigi-lo uma vez para cada uma.
 */
export default function Planos() {
  const qc = useQueryClient();
  const [criando, setCriando] = useState(false);

  const { data: planos, isLoading, error } = useQuery({
    queryKey: ['planos'],
    queryFn: () => apiFetch<PlanoCurricular[]>('/planos'),
  });
  useRedirecionaEmErro(error);

  const criar = useMutation({
    mutationFn: (dados: {
      nome: string;
      disciplina?: string;
      anoLetivo: number;
      semestre?: number;
    }) => apiFetch('/planos', { method: 'POST', body: JSON.stringify(dados) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['planos'] });
      setCriando(false);
      toast.success('Plano criado. Agora cadastre as unidades.');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Não foi possível criar.'),
  });

  return (
    <AppShell
      titulo="Planos de curso"
      descricao={planos ? `${planos.length} cadastrado(s)` : undefined}
      acao={
        <Button
          size="sm"
          variant={criando ? 'outline' : 'default'}
          onClick={() => setCriando((v) => !v)}
        >
          {criando ? <X /> : <Plus />}
          {criando ? 'Cancelar' : 'Novo'}
        </Button>
      }
    >
      <div className="space-y-3">
        {criando && <FormularioPlano onEnviar={(d) => criar.mutate(d)} enviando={criar.isPending} />}

        {isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <Card key={i}>
                <CardHeader className="space-y-2">
                  <Skeleton className="h-4 w-2/5" />
                  <Skeleton className="h-3 w-1/4" />
                </CardHeader>
              </Card>
            ))}
          </div>
        )}

        {!isLoading && (planos?.length ?? 0) === 0 && !criando && (
          <Vazio
            titulo="Nenhum plano de curso ainda"
            descricao="É o conteúdo que você planeja dar no ano, dividido em unidades e tópicos. Sem ele, o fechamento da aula não tem em que unidade se apoiar — e os registros deixam de ser comparáveis entre si."
            acao={
              <Button onClick={() => setCriando(true)}>
                <Plus />
                Criar o primeiro
              </Button>
            }
          />
        )}

        {planos?.map((p) => (
          <Link key={p.id} href={`/planos/detalhe?id=${p.id}`} className="block">
            <Card className="transition-colors hover:bg-accent/50">
              <CardHeader className="flex-row items-center gap-3 space-y-0">
                <div className="min-w-0 flex-1">
                  <CardTitle className="truncate text-base">{p.nome}</CardTitle>
                  <p className="truncate text-xs text-muted-foreground">
                    {periodoLetivo(p.anoLetivo, p.semestre)}
                    {p.disciplina ? ` · ${p.disciplina}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant={(p._count?.unidades ?? 0) > 0 ? 'neutro' : 'alarme'}>
                    {p._count?.unidades ?? 0} unidade(s)
                  </Badge>
                  {(p._count?.cadeiras ?? 0) > 0 && (
                    <Badge variant="neutro">{p._count?.cadeiras} turma(s)</Badge>
                  )}
                  <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                </div>
              </CardHeader>
            </Card>
          </Link>
        ))}

        {(planos?.length ?? 0) > 0 && (
          <p className="px-1 text-xs text-muted-foreground">
            Ligue cada turma a um plano na tela de Cadeiras. Turmas que seguem o mesmo plano passam
            a sugerir conteúdo uma para a outra no fechamento.
          </p>
        )}
      </div>
    </AppShell>
  );
}

function FormularioPlano({
  onEnviar,
  enviando,
}: {
  onEnviar: (d: {
    nome: string;
    disciplina?: string;
    anoLetivo: number;
    semestre?: number;
  }) => void;
  enviando: boolean;
}) {
  const [nome, setNome] = useState('');
  const [disciplina, setDisciplina] = useState('');
  const [anoLetivo, setAnoLetivo] = useState(new Date().getFullYear());
  const [semestre, setSemestre] = useState('');

  return (
    <Card>
      <CardContent className="pt-4 sm:pt-5">
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            onEnviar({
              nome,
              disciplina: disciplina || undefined,
              anoLetivo,
              semestre: semestreDoCampo(semestre),
            });
          }}
        >
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="nome">Nome do plano</Label>
            <Input
              id="nome"
              required
              autoFocus
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Matemática — 8º ano"
            />
            <p className="text-xs text-muted-foreground">
              Um por disciplina e ano. A mesma disciplina em escolas diferentes pode ter currículos
              diferentes — nesse caso, crie dois.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="disciplina">Disciplina (opcional)</Label>
            <Input
              id="disciplina"
              value={disciplina}
              onChange={(e) => setDisciplina(e.target.value)}
              placeholder="Matemática"
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
          <CampoPeriodo
            id="periodo-plano"
            valor={semestre}
            onChange={setSemestre}
            ano={anoLetivo}
          />
          <div className="sm:col-span-2">
            <Button type="submit" loading={enviando} className="w-full">
              Criar plano
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
