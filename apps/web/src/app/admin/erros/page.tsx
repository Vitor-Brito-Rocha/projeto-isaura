'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch } from '@/lib/api';
import { dataHoraBR } from '@/lib/datas';
import { useRedirecionaEmErro } from '@/lib/sessao';
import type { ErroLog, ErroLogDetalhe, Pagina } from '@/lib/types';


/**
 * O log de erro que o `ErrosService` grava.
 *
 * `erros_log` tem RLS ligada e nenhuma policy — nem a chave anônima nem outra
 * conta enxergam a tabela. Esta tela é a única porta, e ela passa pelo
 * `AdminGuard`.
 */
export default function Erros() {
  const [pagina, setPagina] = useState(1);
  const [origem, setOrigem] = useState('');
  const [aberto, setAberto] = useState<string | null>(null);

  const busca = origem.trim();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['admin', 'erros', pagina, busca],
    queryFn: () =>
      apiFetch<Pagina<ErroLog>>(
        `/admin/erros?pagina=${pagina}&tamanho=30${busca ? `&origem=${encodeURIComponent(busca)}` : ''}`,
      ),
    retry: false,
    placeholderData: (anterior) => anterior,
  });
  useRedirecionaEmErro(error);

  // A stack só é buscada quando ela é aberta: é o campo que estoura a resposta
  // da lista, e na maioria das vezes a mensagem já resolve.
  const detalhe = useQuery({
    queryKey: ['admin', 'erro', aberto],
    queryFn: () => apiFetch<ErroLogDetalhe>(`/admin/erros/${aberto}`),
    enabled: Boolean(aberto),
  });

  const paginas = data ? Math.max(1, Math.ceil(data.total / data.tamanho)) : 1;

  return (
    <AppShell
      titulo="Log de erros"
      descricao={data ? `${data.total} registrados` : undefined}
      acao={
        <Button asChild size="sm" variant="outline">
          <Link href="/admin">
            <ArrowLeft /> Admin
          </Link>
        </Button>
      }
    >
      <div className="space-y-3">
        <Input
          value={origem}
          onChange={(e) => {
            setOrigem(e.target.value);
            setPagina(1);
          }}
          placeholder="Filtrar por origem (http, cron, ResumoService…)"
        />

        {isError && (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Área restrita.
            </CardContent>
          </Card>
        )}

        {isLoading && <Skeleton className="h-40 w-full" />}

        {data && data.itens.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Nenhum erro registrado{busca ? ' com esse filtro' : ''}.
            </CardContent>
          </Card>
        )}

        {data?.itens.map((e) => (
          <Card key={e.id}>
            <CardContent className="space-y-1.5 py-3">
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <Badge variant="outline" className="font-normal">
                  {e.origem}
                </Badge>
                <span className="font-mono">
                  {e.metodo} {e.rota}
                </span>
                <span className="ml-auto">{dataHoraBR(e.criadoEm)}</span>
              </div>

              <p className="whitespace-pre-wrap break-words text-sm">{e.mensagem}</p>

              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                onClick={() => setAberto(aberto === e.id ? null : e.id)}
              >
                {aberto === e.id ? 'Esconder stack' : 'Ver stack'}
              </Button>

              {aberto === e.id && (
                <pre className="max-h-72 overflow-auto rounded-md bg-muted p-2 text-xs">
                  {detalhe.isLoading
                    ? 'Carregando…'
                    : (detalhe.data?.stack ?? 'Sem stack registrada.')}
                </pre>
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
