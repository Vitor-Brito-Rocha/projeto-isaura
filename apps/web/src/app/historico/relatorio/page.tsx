'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Printer } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api';
import { dataBR, dataHoraBR, diaEDataBR } from '@/lib/datas';
import { useRedirecionaSeDeslogado } from '@/lib/sessao';
import type { LinhaDoHistorico, Pagina, Perfil } from '@/lib/types';

/**
 * Relatório para imprimir — ou salvar em PDF, que é o que o navegador dela já
 * faz de graça.
 *
 * Sem biblioteca de PDF no servidor de propósito: seria peso morto para gerar o
 * que o Chrome gera com Ctrl+P, e um layout a mais para manter em sincronia com
 * a tela.
 *
 * **A fala e o rascunho da IA não aparecem aqui**, e não porque esta tela os
 * esconde: o endpoint não os busca do banco. Este é o documento que sai da mão
 * dela, e a fala pode ter nome de aluno.
 */
export default function Relatorio() {
  return (
    <Suspense fallback={null}>
      <Conteudo />
    </Suspense>
  );
}

function Conteudo() {
  const params = useSearchParams();

  const { data, isLoading, error } = useQuery({
    queryKey: ['historico', 'relatorio', params.toString()],
    queryFn: () => apiFetch<Pagina<LinhaDoHistorico>>(`/historico?${params.toString()}`),
  });
  useRedirecionaSeDeslogado(error);

  const { data: perfil } = useQuery({
    queryKey: ['perfil'],
    queryFn: () => apiFetch<Perfil>('/perfil'),
  });

  const itens = data?.itens ?? [];
  // Do mais antigo para o mais novo: relatório se lê em ordem cronológica,
  // ao contrário da tela, onde a pergunta é "o que eu dei semana passada".
  const emOrdem = [...itens].sort((a, b) => a.data.localeCompare(b.data));

  const de = params.get('de');
  const ate = params.get('ate');
  const turmas = [...new Set(itens.map((l) => `${l.cadeira.disciplina} · ${l.cadeira.turma}`))];

  return (
    <div className="mx-auto max-w-3xl bg-background px-6 py-8 text-foreground">
      <style>{`
        @media print {
          /* A barra de navegação e os botões não existem no papel. */
          .nao-imprime { display: none !important; }
          /* Um registro não pode partir entre duas páginas: a metade de cima
             numa folha e a de baixo na outra torna o documento ilegível. */
          .registro { break-inside: avoid; page-break-inside: avoid; }
          body { background: #fff; }
          @page { margin: 1.6cm; }
        }
      `}</style>

      <div className="nao-imprime mb-6 flex flex-wrap items-center gap-2">
        <Button asChild size="sm" variant="outline">
          <Link href="/historico">
            <ArrowLeft /> Histórico
          </Link>
        </Button>
        <Button size="sm" onClick={() => window.print()}>
          <Printer /> Imprimir ou salvar em PDF
        </Button>
        <p className="w-full text-xs text-muted-foreground">
          Na janela de impressão, escolha &ldquo;Salvar como PDF&rdquo; para mandar por e-mail.
        </p>
      </div>

      <header className="mb-6 border-b pb-4">
        <h1 className="text-xl font-semibold">Registro de aulas</h1>
        {perfil && <p className="text-sm text-muted-foreground">{perfil.nome}</p>}
        <p className="mt-1 text-sm text-muted-foreground">
          {de || ate
            ? `Período: ${de ? dataBR(de) : 'início'} a ${ate ? dataBR(ate) : 'hoje'}`
            : 'Período: todo o histórico'}
          {turmas.length === 1 && ` · ${turmas[0]}`}
        </p>
        <p className="text-xs text-muted-foreground">
          {itens.length} aula(s) · emitido em {dataHoraBR(new Date())}
        </p>
      </header>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}

      {!isLoading && emOrdem.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhuma aula registrada neste recorte.</p>
      )}

      <div className="space-y-5">
        {emOrdem.map((l) => (
          <article key={l.registroId} className="registro border-b pb-4 last:border-b-0">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold">
                {l.cadeira.disciplina} · {l.cadeira.turma}
              </h2>
              <span className="text-xs text-muted-foreground">
                {diaEDataBR(l.data)} · {l.horaInicio}–{l.horaFim}
              </span>
            </div>

            {l.unidade && (
              <p className="mt-1 text-xs text-muted-foreground">
                Unidade: {l.unidade}
                {l.topicos.length > 0 && ` — ${l.topicos.join('; ')}`}
              </p>
            )}

            {l.conteudoDado && <p className="mt-2 whitespace-pre-wrap text-sm">{l.conteudoDado}</p>}

            {l.atividadeCasa && (
              <p className="mt-1.5 text-sm">
                <strong className="font-medium">Atividade de casa:</strong> {l.atividadeCasa}
                {l.dataEntrega && ` (entrega em ${dataBR(l.dataEntrega)})`}
              </p>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
