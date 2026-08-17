'use client';

import { FileWarning, Printer, Send, Share2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { apiFetch } from '@/lib/api';
import { entregarCsv, historicoParaCsv, pendenciasParaCsv } from '@/lib/csv';
import {
  ajudaDeEntrega,
  detectarEntrega,
  nomeDoArquivo,
  rotuloDeEntrega,
  type Entrega,
} from '@/lib/entrega';
import type { Cadeira, LinhaDoHistorico, Ocorrencia, Pagina } from '@/lib/types';

/** O serviço recorta em 500; a exportação pede tudo de uma vez. */
const TUDO = 500;

/**
 * Os dois artefatos, e por que são dois botões e não um.
 *
 * O **resumo das aulas** é o que ela entrega: prova de trabalho, o que foi
 * dado, quando, em que unidade. As **pendências** são o que falta — uma lista
 * das aulas que ela não registrou. Sozinha, entregue a quem a avalia, essa
 * segunda lista é documento contra ela mesma.
 *
 * Então não podem sair no mesmo arquivo nem atrás do mesmo botão, e a diferença
 * precisa estar dita ANTES do clique, não depois. É a mesma família de decisão
 * que "a fala não sai pela exportação": o que sai da mão dela nunca carrega
 * mais do que ela escolheu mandar.
 */
export function Exportar({
  consulta,
  cadeiras,
  cadeiraIds,
  periodo,
}: {
  /** A querystring já montada com o recorte atual. */
  consulta: (tamanho: number) => string;
  cadeiras: Cadeira[];
  cadeiraIds: string[];
  periodo?: string;
}) {
  const [entrega, setEntrega] = useState<Entrega | null>(null);
  const [ocupado, setOcupado] = useState<'aulas' | 'pendencias' | null>(null);

  // Só no cliente: a sonda lê `navigator`, que não existe no SSR.
  useEffect(() => setEntrega(detectarEntrega()), []);

  const escolhidas = cadeiras.filter((c) => cadeiraIds.includes(c.id));
  const identificacao = {
    disciplinas: [...new Set(escolhidas.map((c) => c.disciplina))],
    turmas: escolhidas.map((c) => c.turma),
    periodo,
  };

  async function sair(
    tipo: 'aulas' | 'pendencias',
    buscar: () => Promise<{ csv: string; quantos: number }>,
  ) {
    setOcupado(tipo);
    try {
      const { csv, quantos } = await buscar();
      if (quantos === 0) {
        toast.warning('Nada para exportar com estes filtros.');
        return;
      }

      const desfecho = await entregarCsv(nomeDoArquivo({ tipo, ...identificacao }), csv);
      // Desistir não é falhar: ela fechou a folha de compartilhamento de
      // propósito, e um toast vermelho aqui diria que quebrou algo.
      if (desfecho === 'CANCELADO') return;
      if (desfecho === 'FALHOU') {
        toast.error('Não foi possível entregar o arquivo.');
        return;
      }
      toast.success(`${quantos} linha(s) em ${rotuloDeEntrega(entrega ?? 'BAIXAR').toLowerCase()}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível exportar.');
    } finally {
      setOcupado(null);
    }
  }

  const exportarAulas = () =>
    sair('aulas', async () => {
      // Rebusca tudo em vez de exportar a página na tela: ninguém quer um
      // relatório com 20 das 137 aulas e nenhum aviso de que faltaram 117.
      const todos = await apiFetch<Pagina<LinhaDoHistorico>>(`/historico?${consulta(TUDO)}`);
      return { csv: historicoParaCsv(todos.itens), quantos: todos.itens.length };
    });

  const exportarPendencias = () =>
    sair('pendencias', async () => {
      const abertas = await apiFetch<Ocorrencia[]>(
        `/agenda/pendencias?${consulta(TUDO)}&dias=365&limite=2000`,
      );
      return { csv: pendenciasParaCsv(abertas), quantos: abertas.length };
    });

  const Icone = entrega === 'COMPARTILHAR' ? Share2 : Send;

  return (
    <Card>
      <CardContent className="space-y-3 py-3">
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Para a coordenação</p>
          <p className="text-xs text-muted-foreground">
            As aulas que você registrou no recorte acima. Sua fala gravada não entra, e rascunho da
            IA que você não revisou também não.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" onClick={exportarAulas} loading={ocupado === 'aulas'}>
              {ocupado !== 'aulas' && <Icone />}
              {entrega ? rotuloDeEntrega(entrega) : 'Exportar'} aulas
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href={`/historico/relatorio?${consulta(TUDO)}`}>
                <Printer />
                Imprimir
              </Link>
            </Button>
          </div>
          {entrega && <p className="text-xs text-muted-foreground">{ajudaDeEntrega(entrega)}</p>}
        </div>

        <div className="space-y-1.5 border-t pt-3">
          <p className="text-sm font-medium">Só para você</p>
          <p className="text-xs text-muted-foreground">
            As aulas que ainda estão sem conteúdo escrito. Serve para você saber o que consertar
            antes de mandar o de cima — <strong>não é lista para entregar</strong>.
          </p>
          <Button
            size="sm"
            variant="outline"
            className="mt-1"
            onClick={exportarPendencias}
            loading={ocupado === 'pendencias'}
          >
            {ocupado !== 'pendencias' && <FileWarning />}
            {entrega ? rotuloDeEntrega(entrega) : 'Exportar'} pendências
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
