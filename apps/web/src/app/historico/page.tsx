'use client';

import { useQuery } from '@tanstack/react-query';
import { Paperclip, Search } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { AppShell, Vazio } from '@/components/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch } from '@/lib/api';
import { dataBR, diaEDataBR } from '@/lib/datas';
import { periodoLetivo } from '@/lib/periodo';
import { useRedirecionaEmErro } from '@/lib/sessao';
import type { Cadeira, LinhaDoHistorico, Pagina } from '@/lib/types';
import { Exportar } from './exportar';
import { FiltroDeTurmas } from './filtro-turmas';

const POR_PAGINA = 20;

/** Tudo o que a exportação leva de uma vez. O serviço recorta em 500. */
const TUDO = 500;

/**
 * O que foi dado, em ordem, com busca e exportação.
 *
 * É a tela que ela abre quando a coordenação pergunta — e o motivo de o
 * histórico existir separado do registro de uma aula: aqui a pergunta é sobre
 * muitas aulas, não sobre uma.
 *
 * Só entra o que ela revisou e salvou. Rascunho de IA não é registro de aula, e
 * isto vira documento.
 */
export default function Historico() {
  const [cadeiraIds, setCadeiraIds] = useState<string[]>([]);
  const [busca, setBusca] = useState('');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [pagina, setPagina] = useState(1);

  const filtros = (tamanho: number, p = pagina) =>
    new URLSearchParams({
      // Uma chave separada por vírgula, e não a chave repetida: este mesmo
      // texto vai parar no link do relatório de impressão, e onze repetições
      // deixariam a URL ilegível.
      ...(cadeiraIds.length ? { cadeiraIds: cadeiraIds.join(',') } : {}),
      ...(busca.trim() ? { busca: busca.trim() } : {}),
      ...(de ? { de } : {}),
      ...(ate ? { ate } : {}),
      pagina: String(p),
      tamanho: String(tamanho),
    }).toString();

  const { data: cadeiras } = useQuery({
    queryKey: ['cadeiras'],
    queryFn: () => apiFetch<Cadeira[]>('/cadeiras'),
  });

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['historico', cadeiraIds.join(','), busca.trim(), de, ate, pagina],
    queryFn: () => apiFetch<Pagina<LinhaDoHistorico>>(`/historico?${filtros(POR_PAGINA)}`),
    placeholderData: (anterior) => anterior,
  });
  useRedirecionaEmErro(error);

  const paginas = data ? Math.max(1, Math.ceil(data.total / data.tamanho)) : 1;

  const zerarPagina = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setPagina(1);
  };

  /**
   * O período que vai no nome do arquivo.
   *
   * Sai das turmas escolhidas, e só quando elas concordam: exportar 8ºA de
   * 2026.1 junto com uma turma de 2026.2 não tem um período que descreva as
   * duas, e escrever um dos dois no nome seria rotular o arquivo errado.
   */
  const escolhidas = (cadeiras ?? []).filter((c) => cadeiraIds.includes(c.id));
  const periodos = new Set(escolhidas.map((c) => periodoLetivo(c.anoLetivo, c.semestre)));
  const periodo = periodos.size === 1 ? [...periodos][0] : undefined;

  return (
    <AppShell
      titulo="Histórico"
      descricao={data ? `${data.total} aula(s) registrada(s)` : undefined}
    >
      <div className="space-y-3">
        <Card>
          <CardContent className="grid gap-3 py-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="busca">Procurar no que foi dado</Label>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  id="busca"
                  value={busca}
                  onChange={(e) => zerarPagina(setBusca)(e.target.value)}
                  placeholder="frações, prova, revisão…"
                  className="pl-9"
                />
              </div>
              {/* A fala dela não é varrida de propósito — busca é o jeito mais
                  fácil de transformar campo privado em índice consultável. */}
              <p className="text-xs text-muted-foreground">
                Procura no conteúdo, no plano e na atividade. Não procura na sua fala gravada.
              </p>
            </div>

            <div className="sm:col-span-2">
              <FiltroDeTurmas
                cadeiras={cadeiras ?? []}
                escolhidas={cadeiraIds}
                onMudar={zerarPagina(setCadeiraIds)}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="de">De</Label>
                <Input
                  id="de"
                  type="date"
                  value={de}
                  onChange={(e) => zerarPagina(setDe)(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ate">Até</Label>
                <Input
                  id="ate"
                  type="date"
                  value={ate}
                  onChange={(e) => zerarPagina(setAte)(e.target.value)}
                />
              </div>
            </div>
            {(de || ate) && (
              // O seletor nativo desenha no formato do sistema operacional.
              <p className="text-xs text-muted-foreground sm:col-span-2">
                {de ? diaEDataBR(de) : 'desde o começo'} até {ate ? diaEDataBR(ate) : 'hoje'}
              </p>
            )}
          </CardContent>
        </Card>

        <Exportar
          consulta={(tamanho) => filtros(tamanho, 1)}
          cadeiras={cadeiras ?? []}
          cadeiraIds={cadeiraIds}
          periodo={periodo}
        />

        <div className="h-0.5" aria-hidden>
          {isFetching && !isLoading && (
            <div className="h-0.5 animate-pulse rounded-full bg-primary/40" />
          )}
        </div>

        {isLoading &&
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}

        {!isLoading && data?.itens.length === 0 && (
          <Vazio
            titulo="Nenhuma aula registrada aqui"
            descricao={
              busca.trim() || cadeiraIds.length || de || ate
                ? 'Nenhum registro com esses filtros. Tente afrouxar a busca ou o período.'
                : 'Assim que você fechar a primeira aula, ela aparece nesta lista.'
            }
          />
        )}

        {data?.itens.map((l) => (
          <Card key={l.registroId}>
            <CardContent className="space-y-2 py-3">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span
                  className="h-4 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: l.cadeira.corHex }}
                  aria-hidden
                />
                <Link
                  href={`/aula?ocorrencia=${l.ocorrenciaId}&momento=fechamento`}
                  className="text-sm font-medium hover:underline"
                >
                  {l.cadeira.disciplina} · {l.cadeira.turma}
                </Link>
                <span className="text-xs text-muted-foreground">
                  {diaEDataBR(l.data)} · {l.horaInicio}–{l.horaFim}
                </span>
                {l.anexos > 0 && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Paperclip className="size-3" aria-hidden />
                    {l.anexos}
                  </span>
                )}
              </div>

              {l.conteudoDado && <p className="whitespace-pre-wrap text-sm">{l.conteudoDado}</p>}

              {(l.unidade || l.topicos.length > 0) && (
                <div className="flex flex-wrap gap-1.5">
                  {l.unidade && <Badge variant="neutro">{l.unidade}</Badge>}
                  {l.topicos.map((t) => (
                    <Badge key={t} variant="outline" className="font-normal">
                      {t}
                    </Badge>
                  ))}
                </div>
              )}

              {l.atividadeCasa && (
                <p className="text-xs text-muted-foreground">
                  <strong className="font-medium">Casa:</strong> {l.atividadeCasa}
                  {l.dataEntrega && ` · entrega ${dataBR(l.dataEntrega)}`}
                </p>
              )}
            </CardContent>
          </Card>
        ))}

        {paginas > 1 && (
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pagina <= 1}
              onClick={() => setPagina((p) => p - 1)}
            >
              Anterior
            </Button>
            <span className="text-xs text-muted-foreground">
              {pagina} de {paginas}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={pagina >= paginas}
              onClick={() => setPagina((p) => p + 1)}
            >
              Próxima
            </Button>
          </div>
        )}
      </div>
    </AppShell>
  );
}
