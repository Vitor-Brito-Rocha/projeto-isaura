'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, Lightbulb, Users } from 'lucide-react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AppShell } from '@/components/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { apiFetch } from '@/lib/api';
import { useRedirecionaSeDeslogado } from '@/lib/sessao';
import type { ContextoAula } from '@/lib/types';
import { useFilaOffline, type Desfecho } from '@/lib/usar-fila';

type Momento = 'abertura' | 'fechamento';

/**
 * Diz a verdade sobre onde o registro está.
 *
 * "Salvo" quando o texto só chegou no aparelho seria a mesma classe de mentira
 * que prometer um alarme que não toca: ela fecharia o app achando que a
 * coordenação já pode ver aquilo.
 */
function avisar(desfecho: Desfecho) {
  if (desfecho === 'enviado') {
    toast.success('Aula registrada.');
    return;
  }
  toast.success('Salvo no aparelho.', {
    description: 'Sem rede agora — sobe sozinho quando a conexão voltar.',
    duration: 6000,
  });
}

function dataCurta(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

/**
 * A tela que o alarme abre.
 *
 * O push carrega `/aula/:id?momento=abertura|fechamento`, então o parâmetro
 * decide qual formulário aparece primeiro — mas os dois ficam alcançáveis: ela
 * pode ter perdido o alarme de abertura e estar registrando tudo no fim.
 */
export default function Aula() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const qc = useQueryClient();

  const momentoDoAlarme = params.get('momento') === 'abertura' ? 'abertura' : 'fechamento';
  const [momento, setMomento] = useState<Momento>(momentoDoAlarme);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['aula', id],
    queryFn: () => apiFetch<ContextoAula>(`/registros/ocorrencia/${id}`),
    enabled: Boolean(id),
  });
  useRedirecionaSeDeslogado(error);

  if (isLoading) {
    return (
      <AppShell titulo="Aula">
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AppShell>
    );
  }

  if (isError || !data) {
    return (
      <AppShell titulo="Aula">
        <Card>
          <CardContent className="space-y-3 py-8 text-center">
            <p className="font-medium">Não foi possível abrir esta aula.</p>
            <p className="text-sm text-muted-foreground">
              {error instanceof Error ? error.message : 'Tente de novo em instantes.'}
            </p>
            <Button asChild variant="outline" size="sm">
              <Link href="/">
                <ArrowLeft /> Voltar para a semana
              </Link>
            </Button>
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  const { ocorrencia, unidades, sugestoes } = data;
  const { cadeira } = ocorrencia;

  return (
    <AppShell
      titulo={`${cadeira.disciplina} · ${cadeira.turma}`}
      descricao={`${dataCurta(ocorrencia.data)} · ${ocorrencia.horaInicio}–${ocorrencia.horaFim}`}
      acao={
        <Button asChild size="sm" variant="outline">
          <Link href="/">
            <ArrowLeft /> Semana
          </Link>
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex gap-2" role="tablist">
          {(['abertura', 'fechamento'] as const).map((m) => (
            <Button
              key={m}
              role="tab"
              aria-selected={momento === m}
              variant={momento === m ? 'default' : 'outline'}
              size="sm"
              className="flex-1"
              onClick={() => setMomento(m)}
            >
              {m === 'abertura' ? 'O que planejo dar' : 'O que eu dei'}
            </Button>
          ))}
        </div>

        {momento === 'abertura' ? (
          <FormAbertura
            ocorrenciaId={id}
            contexto={data}
            onSalvo={() => {
              qc.invalidateQueries({ queryKey: ['aula', id] });
              qc.invalidateQueries({ queryKey: ['agenda'] });
            }}
          />
        ) : (
          <FormFechamento
            ocorrenciaId={id}
            contexto={data}
            unidades={unidades}
            sugestaoIrma={sugestoes.daTurmaIrma}
            onSalvo={() => {
              qc.invalidateQueries({ queryKey: ['aula', id] });
              qc.invalidateQueries({ queryKey: ['agenda'] });
            }}
          />
        )}
      </div>
    </AppShell>
  );
}

/** Sugestão clicável: preenche o campo em vez de só informar. */
function Sugestao({
  icone: Icone,
  rotulo,
  texto,
  onUsar,
}: {
  icone: typeof Lightbulb;
  rotulo: string;
  texto: string;
  onUsar: () => void;
}) {
  return (
    <div className="rounded-md border border-dashed bg-muted/40 p-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icone className="size-3.5" aria-hidden />
        {rotulo}
      </p>
      <p className="mt-1 whitespace-pre-wrap text-sm">{texto}</p>
      <Button type="button" size="sm" variant="ghost" className="mt-1 h-7 px-2" onClick={onUsar}>
        Usar este texto
      </Button>
    </div>
  );
}

function FormAbertura({
  ocorrenciaId,
  contexto,
  onSalvo,
}: {
  ocorrenciaId: string;
  contexto: ContextoAula;
  onSalvo: () => void;
}) {
  const anterior = contexto.sugestoes.daAulaAnterior;
  const [plano, setPlano] = useState('');

  // Pré-preenche com o que ela escreveu como "próxima aula" no fechamento
  // anterior. É o que transforma o alarme em confirmação em vez de digitação.
  useEffect(() => {
    setPlano(contexto.registro?.planoPrevisto ?? anterior?.texto ?? '');
  }, [contexto.registro?.planoPrevisto, anterior?.texto]);

  const { salvar: salvarComFila } = useFilaOffline();

  const salvar = useMutation({
    mutationFn: () =>
      salvarComFila(`abertura:${ocorrenciaId}`, `/registros/ocorrencia/${ocorrenciaId}/abertura`, {
        planoPrevisto: plano,
      }),
    onSuccess: (desfecho) => {
      avisar(desfecho);
      onSalvo();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Não foi possível salvar.'),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">O que você planeja dar?</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {anterior && !contexto.registro?.planoPrevisto && (
          <Sugestao
            icone={Lightbulb}
            rotulo={`Você planejou isto no fim da aula de ${dataCurta(anterior.data)}`}
            texto={anterior.texto}
            onUsar={() => setPlano(anterior.texto)}
          />
        )}

        <div className="space-y-1.5">
          <Label htmlFor="plano">Plano da aula</Label>
          <Textarea
            id="plano"
            value={plano}
            onChange={(e) => setPlano(e.target.value)}
            placeholder="Ex.: terminar frações equivalentes e começar soma"
            rows={5}
          />
        </div>

        <Button onClick={() => salvar.mutate()} disabled={salvar.isPending} className="w-full">
          <Check /> {salvar.isPending ? 'Salvando…' : 'Salvar'}
        </Button>
      </CardContent>
    </Card>
  );
}

function FormFechamento({
  ocorrenciaId,
  contexto,
  unidades,
  sugestaoIrma,
  onSalvo,
}: {
  ocorrenciaId: string;
  contexto: ContextoAula;
  unidades: ContextoAula['unidades'];
  sugestaoIrma: ContextoAula['sugestoes']['daTurmaIrma'];
  onSalvo: () => void;
}) {
  const registro = contexto.registro;
  const [conteudo, setConteudo] = useState('');
  const [unidadeId, setUnidadeId] = useState('');
  const [topicos, setTopicos] = useState<string[]>([]);
  const [atividade, setAtividade] = useState('');
  const [entrega, setEntrega] = useState('');
  const [proxima, setProxima] = useState('');

  useEffect(() => {
    setConteudo(registro?.conteudoDado ?? '');
    setUnidadeId(registro?.unidadeId ?? sugestaoIrma?.unidadeId ?? '');
    setTopicos(registro?.topicos.map((t) => t.topicoId) ?? []);
    setAtividade(registro?.atividadeCasa ?? '');
    setEntrega(registro?.dataEntrega?.slice(0, 10) ?? '');
    setProxima(registro?.planoProximaAula ?? '');
  }, [registro, sugestaoIrma?.unidadeId]);

  const { salvar: salvarComFila } = useFilaOffline();

  const salvar = useMutation({
    mutationFn: () =>
      salvarComFila(
        `fechamento:${ocorrenciaId}`,
        `/registros/ocorrencia/${ocorrenciaId}/fechamento`,
        {
          conteudoDado: conteudo,
          unidadeId: unidadeId || undefined,
          topicosCobertos: topicos,
          atividadeCasa: atividade,
          dataEntrega: entrega,
          planoProximaAula: proxima,
        },
      ),
    onSuccess: (desfecho) => {
      avisar(desfecho);
      onSalvo();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Não foi possível salvar.'),
  });

  const unidadeAtual = unidades.find((u) => u.id === unidadeId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">O que você deu?</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {contexto.registro?.planoPrevisto && (
          <div className="rounded-md border-l-2 border-primary/40 bg-muted/40 px-3 py-2">
            <p className="text-xs font-medium text-muted-foreground">Você planejou</p>
            <p className="mt-0.5 whitespace-pre-wrap text-sm">{contexto.registro.planoPrevisto}</p>
          </div>
        )}

        {sugestaoIrma && !registro?.conteudoDado && (
          <Sugestao
            icone={Users}
            rotulo={`No ${sugestaoIrma.turma}, em ${dataCurta(sugestaoIrma.data)}, você deu`}
            texto={sugestaoIrma.texto}
            onUsar={() => setConteudo(sugestaoIrma.texto)}
          />
        )}

        <div className="space-y-1.5">
          <Label htmlFor="conteudo">Conteúdo dado</Label>
          <Textarea
            id="conteudo"
            value={conteudo}
            onChange={(e) => setConteudo(e.target.value)}
            placeholder="Ex.: frações equivalentes, exercícios 1 a 8"
            rows={4}
          />
        </div>

        {unidades.length > 0 ? (
          <div className="space-y-1.5">
            <Label htmlFor="unidade">Unidade</Label>
            {/* Select nativo de propósito: no celular ele abre a roleta do SO,
                que é mais rápida de acertar com o polegar do que uma lista. */}
            <select
              id="unidade"
              value={unidadeId}
              onChange={(e) => {
                setUnidadeId(e.target.value);
                setTopicos([]);
              }}
              className="flex h-11 w-full rounded-md border border-input bg-card px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm"
            >
              <option value="">— nenhuma —</option>
              {unidades.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.ordem}. {u.titulo}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
            Esta cadeira ainda não segue um plano curricular. Sem unidades cadastradas, o registro
            não entra na tela de progresso.
          </p>
        )}

        {unidadeAtual && unidadeAtual.topicos.length > 0 && (
          <div className="space-y-1.5">
            <Label>Tópicos cobertos</Label>
            <div className="flex flex-wrap gap-1.5">
              {unidadeAtual.topicos.map((t) => {
                const marcado = topicos.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={marcado}
                    onClick={() =>
                      setTopicos((atual) =>
                        marcado ? atual.filter((x) => x !== t.id) : [...atual, t.id],
                      )
                    }
                  >
                    <Badge variant={marcado ? 'default' : 'outline'} className="cursor-pointer">
                      {marcado && <Check className="mr-1 size-3" aria-hidden />}
                      {t.titulo}
                    </Badge>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="atividade">Atividade de casa</Label>
            <Input
              id="atividade"
              value={atividade}
              onChange={(e) => setAtividade(e.target.value)}
              placeholder="Ex.: página 42, exercícios 3 a 7"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="entrega">Entrega em</Label>
            <Input
              id="entrega"
              type="date"
              value={entrega}
              onChange={(e) => setEntrega(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="proxima">Plano da próxima aula</Label>
          <Textarea
            id="proxima"
            value={proxima}
            onChange={(e) => setProxima(e.target.value)}
            placeholder="Aparece pronto na abertura da próxima aula desta turma"
            rows={3}
          />
          <p className="text-xs text-muted-foreground">
            Isto volta pré-preenchido no alarme de abertura da próxima aula.
          </p>
        </div>

        <Button onClick={() => salvar.mutate()} disabled={salvar.isPending} className="w-full">
          <Check /> {salvar.isPending ? 'Salvando…' : 'Salvar registro'}
        </Button>
      </CardContent>
    </Card>
  );
}
