'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { detectarCapacidade, rotuloCapacidade, type Capacidade } from '@/lib/capacidade';
import type { Cadeira } from '@/lib/types';
import { Botao, Cabecalho, Campo, Cartao, Navegacao } from '@/components/ui';
import { PainelAlarme } from './painel-alarme';

export default function Cadeiras() {
  const qc = useQueryClient();
  const [criando, setCriando] = useState(false);
  const [capacidade, setCapacidade] = useState<Capacidade>('SEM_SUPORTE');

  // Só no cliente: a detecção lê navigator/matchMedia, que não existem no SSR.
  useEffect(() => setCapacidade(detectarCapacidade()), []);

  const { data: cadeiras, isLoading } = useQuery({
    queryKey: ['cadeiras'],
    queryFn: () => apiFetch<Cadeira[]>('/cadeiras'),
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
    <div className="flex min-h-dvh flex-col">
      <Cabecalho
        titulo="Cadeiras"
        acao={
          <Botao onClick={() => setCriando((v) => !v)} variante={criando ? 'secundario' : 'primario'}>
            {criando ? 'Cancelar' : 'Nova'}
          </Botao>
        }
      />

      <main className="mx-auto w-full max-w-3xl flex-1 space-y-3 p-4">
        <p className="text-xs text-slate-500">
          Neste aparelho: <strong>{rotuloCapacidade(capacidade)}</strong>
        </p>

        {criando && <FormularioCadeira onEnviar={(d) => criar.mutate(d)} enviando={criar.isPending} />}

        {isLoading && <p className="text-sm text-slate-500">Carregando…</p>}

        {!isLoading && (cadeiras?.length ?? 0) === 0 && !criando && (
          <Cartao className="text-center">
            <p className="text-sm text-slate-600">Nenhuma cadeira ainda.</p>
            <p className="mt-1 text-xs text-slate-500">
              Cada cadeira é uma disciplina numa turma — por exemplo, Matemática no 8º A.
            </p>
          </Cartao>
        )}

        {cadeiras?.map((c) => (
          <Cartao key={c.id} className="space-y-3">
            <div className="flex items-center gap-3">
              <span
                className="h-8 w-1 shrink-0 rounded-full"
                style={{ backgroundColor: c.corHex }}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">
                  {c.disciplina} · {c.turma}
                </p>
                <p className="text-xs text-slate-500">
                  {c.anoLetivo}
                  {c.escola ? ` · ${c.escola.nome}` : ''}
                  {c._count ? ` · ${c._count.series} série(s)` : ''}
                </p>
              </div>
            </div>
            <PainelAlarme cadeiraId={c.id} capacidade={capacidade} />
          </Cartao>
        ))}
      </main>

      <Navegacao />
    </div>
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
    <Cartao>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          onEnviar({ disciplina, turma, anoLetivo });
        }}
      >
        <Campo
          label="Disciplina"
          required
          value={disciplina}
          onChange={(e) => setDisciplina(e.target.value)}
          placeholder="Matemática"
        />
        <Campo
          label="Turma"
          required
          value={turma}
          onChange={(e) => setTurma(e.target.value)}
          placeholder="8º A"
        />
        <Campo
          label="Ano letivo"
          type="number"
          required
          value={anoLetivo}
          onChange={(e) => setAnoLetivo(Number(e.target.value))}
        />
        <Botao type="submit" disabled={enviando}>
          {enviando ? 'Salvando…' : 'Criar cadeira'}
        </Botao>
      </form>
    </Cartao>
  );
}
