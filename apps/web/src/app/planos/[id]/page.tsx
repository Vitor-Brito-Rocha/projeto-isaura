'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { AppShell } from '@/components/app-shell';
import { TextoEditavel } from '@/components/texto-editavel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch } from '@/lib/api';
import { Anexos } from '@/components/anexos';
import { periodoLetivo } from '@/lib/periodo';
import { useRedirecionaSeDeslogado } from '@/lib/sessao';
import type { PlanoDetalhe, Unidade } from '@/lib/types';
import { ImportarPlano } from './importar';

export default function Plano() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [criandoUnidade, setCriandoUnidade] = useState(false);

  const recarregar = () => {
    qc.invalidateQueries({ queryKey: ['plano', id] });
    qc.invalidateQueries({ queryKey: ['planos'] });
  };

  const { data: plano, isLoading, isError, error } = useQuery({
    queryKey: ['plano', id],
    queryFn: () => apiFetch<PlanoDetalhe>(`/planos/${id}`),
    enabled: Boolean(id),
  });
  useRedirecionaSeDeslogado(error);

  const criarUnidade = useMutation({
    mutationFn: (titulo: string) =>
      apiFetch(`/planos/${id}/unidades`, { method: 'POST', body: JSON.stringify({ titulo }) }),
    onSuccess: () => {
      recarregar();
      setCriandoUnidade(false);
      toast.success('Unidade criada.');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Não foi possível criar.'),
  });

  if (isLoading) {
    return (
      <AppShell titulo="Plano de curso">
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </AppShell>
    );
  }

  if (isError || !plano) {
    return (
      <AppShell titulo="Plano de curso">
        <Card>
          <CardContent className="space-y-3 py-8 text-center">
            <p className="font-medium">Não foi possível abrir este plano.</p>
            <p className="text-sm text-muted-foreground">
              {error instanceof Error ? error.message : 'Tente de novo em instantes.'}
            </p>
            <Button asChild variant="outline" size="sm">
              <Link href="/planos">
                <ArrowLeft /> Voltar
              </Link>
            </Button>
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell
      titulo={plano.nome}
      descricao={`${periodoLetivo(plano.anoLetivo, plano.semestre)}${plano.disciplina ? ` · ${plano.disciplina}` : ''}`}
      acao={
        <Button asChild size="sm" variant="outline">
          <Link href="/planos">
            <ArrowLeft /> Planos
          </Link>
        </Button>
      }
    >
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Turmas que seguem este plano</CardTitle>
          </CardHeader>
          <CardContent>
            {plano.cadeiras.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nenhuma ainda. Ligue uma turma a este plano na tela de{' '}
                <Link href="/cadeiras" className="underline underline-offset-2">
                  Cadeiras
                </Link>
                . Enquanto isso, o fechamento dessas aulas não terá unidade para escolher.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {plano.cadeiras.map((c) => (
                  <Badge key={c.id} variant="neutro">
                    {c.disciplina} · {c.turma}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/*
          O documento de origem, guardado inteiro.

          Enquanto não houver leitura por visão, a importação automática não
          existe — mas o papel dela existe. Guardar aqui troca "procurar a folha
          na mochila" por abrir a foto ao lado enquanto digita as unidades. E
          quando a leitura por IA entrar, o arquivo já vai estar no lugar certo.
        */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Documento do plano</CardTitle>
          </CardHeader>
          <CardContent>
            <Anexos
              rota={`/planos/${id}/anexos`}
              chave={['anexos', 'plano', id]}
              titulo="Arquivos"
              rotuloBotao="Anexar o plano escrito"
              ajuda="Foto ou PDF do plano de curso que você já tem. Até 10 MB por arquivo — dá para mandar uma página por vez."
            />
            <ImportarPlano planoId={id} onImportou={recarregar} />
          </CardContent>
        </Card>

        <div className="flex items-center justify-between gap-2 px-1">
          <h2 className="text-sm font-medium">
            Unidades{plano.unidades.length > 0 && ` (${plano.unidades.length})`}
          </h2>
          <Button
            size="sm"
            variant={criandoUnidade ? 'outline' : 'default'}
            onClick={() => setCriandoUnidade((v) => !v)}
          >
            {criandoUnidade ? <X /> : <Plus />}
            {criandoUnidade ? 'Cancelar' : 'Nova unidade'}
          </Button>
        </div>

        {criandoUnidade && (
          <Card>
            <CardContent className="pt-4">
              <FormularioTexto
                rotulo="Título da unidade"
                placeholder="Unidade 1 — Números racionais"
                enviando={criarUnidade.isPending}
                onEnviar={(t) => criarUnidade.mutate(t)}
              />
            </CardContent>
          </Card>
        )}

        {plano.unidades.length === 0 && !criandoUnidade && (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="font-medium">Nenhuma unidade ainda</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                Unidade é o bimestre, capítulo ou módulo. É o que responde &ldquo;onde eu parei no
                8º A?&rdquo; — e o que aparece no fechamento de cada aula.
              </p>
            </CardContent>
          </Card>
        )}

        {plano.unidades.map((u) => (
          <CartaoUnidade key={u.id} planoId={id} unidade={u} onMudou={recarregar} />
        ))}
      </div>
    </AppShell>
  );
}

function CartaoUnidade({
  planoId,
  unidade,
  onMudou,
}: {
  planoId: string;
  unidade: Unidade;
  onMudou: () => void;
}) {
  const [adicionando, setAdicionando] = useState(false);

  const criarTopico = useMutation({
    mutationFn: (titulo: string) =>
      apiFetch(`/planos/${planoId}/unidades/${unidade.id}/topicos`, {
        method: 'POST',
        body: JSON.stringify({ titulo }),
      }),
    onSuccess: () => {
      onMudou();
      setAdicionando(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Não foi possível adicionar.'),
  });

  const removerTopico = useMutation({
    mutationFn: (topicoId: string) =>
      apiFetch(`/planos/${planoId}/unidades/${unidade.id}/topicos/${topicoId}`, {
        method: 'DELETE',
      }),
    onSuccess: onMudou,
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Não foi possível remover.'),
  });

  const removerUnidade = useMutation({
    mutationFn: () => apiFetch(`/planos/${planoId}/unidades/${unidade.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      onMudou();
      toast.success('Unidade removida.');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Não foi possível remover.'),
  });

  const renomearUnidade = useMutation({
    mutationFn: (titulo: string) =>
      apiFetch(`/planos/${planoId}/unidades/${unidade.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ titulo }),
      }),
    onSuccess: onMudou,
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Não foi possível renomear.'),
  });

  const renomearTopico = useMutation({
    mutationFn: ({ id, titulo }: { id: string; titulo: string }) =>
      apiFetch(`/planos/${planoId}/unidades/${unidade.id}/topicos/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ titulo }),
      }),
    onSuccess: onMudou,
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Não foi possível renomear.'),
  });

  return (
    <Card>
      <CardHeader className="flex-row items-start gap-3 space-y-0 pb-3">
        <Badge variant="neutro" className="mt-0.5 shrink-0">
          {unidade.ordem}
        </Badge>
        <CardTitle className="min-w-0 flex-1 text-base">
          <TextoEditavel
            valor={unidade.titulo}
            rotuloAcessivel={`unidade ${unidade.titulo}`}
            aoSalvar={(t) => renomearUnidade.mutate(t)}
          />
        </CardTitle>
        <Button
          size="icon"
          variant="ghost"
          className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
          aria-label={`Remover unidade ${unidade.titulo}`}
          loading={removerUnidade.isPending}
          onClick={() => removerUnidade.mutate()}
        >
          <Trash2 />
        </Button>
      </CardHeader>

      <CardContent className="space-y-3">
        {unidade.topicos.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Sem tópicos. São eles que você marca como cobertos ao fechar a aula.
          </p>
        ) : (
          <ul className="space-y-1">
            {unidade.topicos.map((t) => (
              <li
                key={t.id}
                className="flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-accent/50"
              >
                <span className="w-5 shrink-0 text-xs text-muted-foreground">{t.ordem}.</span>
                <div className="min-w-0 flex-1">
                  <TextoEditavel
                    valor={t.titulo}
                    rotuloAcessivel={`tópico ${t.titulo}`}
                    aoSalvar={(titulo) => renomearTopico.mutate({ id: t.id, titulo })}
                  />
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                  aria-label={`Remover tópico ${t.titulo}`}
                  onClick={() => removerTopico.mutate(t.id)}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        )}

        {adicionando ? (
          <FormularioTexto
            rotulo="Título do tópico"
            placeholder="Frações equivalentes"
            enviando={criarTopico.isPending}
            onEnviar={(t) => criarTopico.mutate(t)}
            onCancelar={() => setAdicionando(false)}
          />
        ) : (
          <Button size="sm" variant="outline" onClick={() => setAdicionando(true)}>
            <Plus />
            Tópico
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

/** Formulário de um campo só — usado para unidade e para tópico. */
function FormularioTexto({
  rotulo,
  placeholder,
  enviando,
  onEnviar,
  onCancelar,
}: {
  rotulo: string;
  placeholder: string;
  enviando: boolean;
  onEnviar: (texto: string) => void;
  onCancelar?: () => void;
}) {
  const [texto, setTexto] = useState('');
  const campoId = `campo-${rotulo.replace(/\s+/g, '-').toLowerCase()}`;

  return (
    <form
      className="space-y-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!texto.trim()) return;
        onEnviar(texto.trim());
        setTexto('');
      }}
    >
      <Label htmlFor={campoId}>{rotulo}</Label>
      <div className="flex gap-2">
        <Input
          id={campoId}
          autoFocus
          required
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={placeholder}
        />
        <Button type="submit" loading={enviando}>
          Adicionar
        </Button>
        {onCancelar && (
          <Button type="button" variant="outline" onClick={onCancelar}>
            <X />
          </Button>
        )}
      </div>
    </form>
  );
}
