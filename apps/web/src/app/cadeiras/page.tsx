'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Plus, RotateCcw, Smartphone, X } from 'lucide-react';
import Link from 'next/link';
import { Fragment, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AppShell, Vazio } from '@/components/app-shell';
import { Confirmar } from '@/components/confirmar';
import { TextoEditavel } from '@/components/texto-editavel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch } from '@/lib/api';
import { detectarCapacidade, rotuloCapacidade, type Capacidade } from '@/lib/capacidade';
import { CampoPeriodo } from '@/components/campo-periodo';
import { sugerirDisciplinas } from '@/lib/disciplinas';
import { periodoLetivo, semestreDoCampo } from '@/lib/periodo';
import { useRedirecionaEmErro } from '@/lib/sessao';
import type { Cadeira, PlanoCurricular, Serie } from '@/lib/types';
import { PainelAlarme } from './painel-alarme';
import { PainelHorarios } from './painel-horarios';

export default function Cadeiras() {
  const qc = useQueryClient();
  const [criando, setCriando] = useState(false);
  const [capacidade, setCapacidade] = useState<Capacidade | null>(null);

  // Só no cliente: a detecção lê navigator/matchMedia, que não existem no SSR.
  useEffect(() => setCapacidade(detectarCapacidade()), []);

  /**
   * Esta tela é a única que vê as arquivadas — e por isso tem CHAVE PRÓPRIA.
   *
   * `['cadeiras']` cru é usado pelo filtro do histórico e pela importação, que
   * querem só as ativas. Duas URLs diferentes sob a mesma chave fazem o React
   * Query servir a que respondeu por último: a tela de importação passaria a
   * oferecer turma arquivada no select, sem nada denunciando. O prefixo é o
   * mesmo, então todo `invalidateQueries(['cadeiras'])` que já existe continua
   * derrubando esta também.
   */
  const { data: cadeiras, isLoading, error } = useQuery({
    queryKey: ['cadeiras', 'com-arquivadas'],
    queryFn: () => apiFetch<Cadeira[]>('/cadeiras?incluirInativas=true'),
  });
  useRedirecionaEmErro(error);

  const { data: planos } = useQuery({
    queryKey: ['planos'],
    queryFn: () => apiFetch<PlanoCurricular[]>('/planos'),
  });

  // Uma requisição para todas as cadeiras, e não uma por cartão: com onze
  // cadeiras seriam onze idas ao servidor para desenhar a mesma tela.
  const { data: series } = useQuery({
    queryKey: ['series'],
    queryFn: () => apiFetch<Serie[]>('/series'),
  });

  const { data: disciplinas } = useQuery({
    queryKey: ['disciplinas'],
    queryFn: () => apiFetch<string[]>('/cadeiras/disciplinas'),
  });

  const seriesDa = (cadeiraId: string) => (series ?? []).filter((s) => s.cadeiraId === cadeiraId);

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

  /**
   * O rótulo da turma, e só ele.
   *
   * Nascia congelado: a importação propõe "30(31)" a partir do `Código/Turma`
   * do documento, e depois de criada a API sempre aceitou o `PATCH` sem
   * nenhuma tela chamar. O conserto era apagar a cadeira — e apagar leva as
   * aulas, os registros e o progresso junto.
   *
   * **Disciplina, ano e semestre ficam de fora de propósito.** Eles dizem o que
   * a cadeira É; trocá-los num clique mudaria a identidade do grupo com o
   * histórico inteiro pendurado nela, e isso é criar outra turma, não corrigir
   * digitação.
   */
  const renomearTurma = useMutation({
    mutationFn: ({ id, turma }: { id: string; turma: string }) =>
      apiFetch(`/cadeiras/${id}`, { method: 'PATCH', body: JSON.stringify({ turma }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cadeiras'] });
      qc.invalidateQueries({ queryKey: ['agenda'] });
      toast.success('Turma renomeada.');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Não foi possível renomear.'),
  });

  /**
   * Arquivar, e não excluir — o nome do botão diz o que a API de fato faz.
   *
   * `cadeira → ocorrencia` é cascade no banco: um delete de verdade levaria
   * junto todas as aulas dadas, com registro, anexo e progresso. O que ela quer
   * quando pede para "excluir a turma" é que a turma pare de aparecer e de
   * tocar alarme, não perder o semestre inteiro.
   */
  const arquivar = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ aulasCanceladas: number }>(`/cadeiras/${id}`, { method: 'DELETE' }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['cadeiras'] });
      qc.invalidateQueries({ queryKey: ['series'] });
      qc.invalidateQueries({ queryKey: ['agenda'] });
      toast.success('Turma arquivada.', {
        description:
          r.aulasCanceladas > 0
            ? `${r.aulasCanceladas} aula(s) futura(s) cancelada(s) — os alarmes delas não vêm mais.`
            : 'O que você já registrou continua no histórico.',
      });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Não foi possível arquivar.'),
  });

  const reativar = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ aulasRestauradas: number; aulasEmConflito: number; conflitaCom: string[] }>(
        `/cadeiras/${id}/reativar`,
        { method: 'POST' },
      ),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['cadeiras'] });
      qc.invalidateQueries({ queryKey: ['series'] });
      qc.invalidateQueries({ queryKey: ['agenda'] });
      // O choque é informação, não erro: a turma voltou. Dizer QUAL turma ficou
      // com o horário é o que permite ela decidir o que fazer — mesma regra da
      // mensagem de choque do formulário de horários.
      toast.success('Turma reativada.', {
        description:
          r.aulasEmConflito > 0
            ? `${r.aulasRestauradas} aula(s) de volta. ${r.aulasEmConflito} continuam canceladas — o horário agora é de ${r.conflitaCom.join(', ')}.`
            : `${r.aulasRestauradas} aula(s) de volta na grade, com os alarmes.`,
      });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Não foi possível reativar.'),
  });

  const criar = useMutation({
    mutationFn: (dados: {
      disciplina: string;
      turma: string;
      anoLetivo: number;
      semestre?: number;
    }) => apiFetch('/cadeiras', { method: 'POST', body: JSON.stringify(dados) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cadeiras'] });
      // A disciplina recém-criada passa a ser sugestão para a próxima.
      qc.invalidateQueries({ queryKey: ['disciplinas'] });
      setCriando(false);
      toast.success('Cadeira criada. Defina os dias e horários dela.');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Não foi possível criar.'),
  });

  return (
    <AppShell
      titulo="Cadeiras"
      descricao={cadeiras ? resumoDaLista(cadeiras) : undefined}
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
          <FormularioCadeira
            onEnviar={(d) => criar.mutate(d)}
            enviando={criar.isPending}
            disciplinas={disciplinas ?? []}
          />
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

        {cadeiras?.map((c, i) => (
          <Fragment key={c.id}>
            {/* A lista já vem ordenada com as arquivadas por último (`ativo:
                'desc'` no serviço), então o cabeçalho aparece exatamente uma
                vez: na primeira arquivada. Sem ele, um cartão apagado no fim da
                lista é ambíguo — ela não tem como saber se aquilo está
                desligado ou só sem horário. */}
            {!c.ativo && (i === 0 || (cadeiras[i - 1]?.ativo ?? false)) && (
              <h2 className="px-1 pt-2 text-sm font-medium text-muted-foreground">Arquivadas</h2>
            )}
            {!c.ativo ? (
              <CartaoArquivada
                cadeira={c}
                carregando={reativar.isPending}
                onReativar={() => reativar.mutate(c.id)}
              />
            ) : (
            <Card>
              <CardHeader className="flex-row items-center gap-3 space-y-0">
                <span
                  className="h-9 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: c.corHex }}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  {/* A disciplina fica fixa e só a turma é editável — ver
                      `renomearTurma`. O rótulo aparece na grade, no alarme e no
                      relatório da coordenação, e é o que ela precisa poder
                      corrigir sem apagar a turma. */}
                  <CardTitle className="flex min-w-0 items-center gap-1 text-base">
                    {/* Os dois truncam: disciplina longa não pode empurrar a
                        turma para fora da tela, que é onde o toque acontece. */}
                    <span className="truncate">{c.disciplina} ·</span>
                    <span className="min-w-0 flex-1">
                      <TextoEditavel
                        valor={c.turma}
                        rotuloAcessivel={`a turma de ${c.disciplina}`}
                        aoSalvar={(turma) => renomearTurma.mutate({ id: c.id, turma })}
                      />
                    </span>
                  </CardTitle>
                  <p className="truncate text-xs text-muted-foreground">
                    {periodoLetivo(c.anoLetivo, c.semestre)}
                    {c.escola ? ` · ${c.escola.nome}` : ''}
                  </p>
                </div>
                {/* Só o estado que pede ação vira etiqueta: quando há horário, o
                    painel logo abaixo já diz qual é, e repetir vira ruído. */}
                {series && seriesDa(c.id).length === 0 && <Badge variant="alarme">sem horário</Badge>}
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

                <PainelHorarios cadeiraId={c.id} series={seriesDa(c.id)} />

                <PainelAlarme cadeiraId={c.id} capacidade={capacidade ?? 'SEM_SUPORTE'} />

                {/* Por último e discreto de propósito: fica no fim do cartão que
                    ela já abriu para mexer no horário, longe do dedo que estava
                    rolando a lista. */}
                <Confirmar
                  perigo
                  titulo={`Arquivar ${c.disciplina} · ${c.turma}?`}
                  rotuloAcao="Arquivar turma"
                  carregando={arquivar.isPending}
                  onConfirmar={() => arquivar.mutate(c.id)}
                  descricao={
                    <>
                      A turma sai desta lista, e as aulas que{' '}
                      <strong>ainda não aconteceram são canceladas</strong> — os alarmes delas param.
                      O horário dela <strong>deixa de bloquear</strong> outra turma, então dá para
                      cadastrar ou importar uma nova no mesmo dia e hora. E ela{' '}
                      <strong>para de aparecer nas pendências</strong>: as aulas que você não
                      registrou não são mais cobradas. O que você já registrou continua no
                      histórico, na exportação e no relatório da coordenação.
                    </>
                  }
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-muted-foreground hover:text-destructive"
                  >
                    <Archive />
                    Arquivar turma
                  </Button>
                </Confirmar>
              </CardContent>
            </Card>
            )}
          </Fragment>
        ))}
      </div>
    </AppShell>
  );
}

function FormularioCadeira({
  onEnviar,
  enviando,
  disciplinas,
}: {
  onEnviar: (d: {
    disciplina: string;
    turma: string;
    anoLetivo: number;
    semestre?: number;
  }) => void;
  enviando: boolean;
  disciplinas: string[];
}) {
  const [disciplina, setDisciplina] = useState('');
  const [turma, setTurma] = useState('');
  const [anoLetivo, setAnoLetivo] = useState(new Date().getFullYear());
  const [semestre, setSemestre] = useState('');

  return (
    <Card>
      <CardContent className="pt-4">
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            onEnviar({ disciplina, turma, anoLetivo, semestre: semestreDoCampo(semestre) });
          }}
        >
          <CampoDisciplina valor={disciplina} onChange={setDisciplina} disciplinas={disciplinas} />
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
          <CampoPeriodo id="periodo-cadeira" valor={semestre} onChange={setSemestre} ano={anoLetivo} />
          <div className="flex items-end sm:col-span-2">
            <Button type="submit" loading={enviando} className="w-full">
              Criar cadeira
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}


/**
 * Disciplina com sugestão do que ela já cadastrou.
 *
 * Digitar o nome de novo a cada turma é onde nasce "Matemática" ao lado de
 * "Matematica": duas disciplinas para o sistema, uma só na cabeça dela, e o
 * histórico partido em dois sem ninguém perceber. As sugestões aparecem também
 * com o campo vazio — com onze cadeiras e poucas disciplinas, escolher é quase
 * sempre mais rápido que digitar.
 */
function CampoDisciplina({
  valor,
  onChange,
  disciplinas,
}: {
  valor: string;
  onChange: (v: string) => void;
  disciplinas: string[];
}) {
  const [focado, setFocado] = useState(false);
  const sugestoes = sugerirDisciplinas(disciplinas, valor);

  return (
    <div className="space-y-1.5">
      <Label htmlFor="disciplina">Disciplina</Label>
      <Input
        id="disciplina"
        required
        autoFocus
        autoComplete="off"
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocado(true)}
        onBlur={() => setFocado(false)}
        placeholder="Matemática"
      />
      {focado && sugestoes.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {sugestoes.map((s) => (
            <button
              key={s}
              type="button"
              // `onMouseDown` com `preventDefault`: o clique normal chegaria
              // depois do blur, que já teria escondido a lista.
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(s);
              }}
              className="rounded-full border bg-card px-2.5 py-1 text-xs hover:bg-accent"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * "6 ativa(s) · 2 arquivada(s)" em vez de "8 cadastrada(s)".
 *
 * O total sozinho passou a mentir no dia em que as arquivadas entraram na
 * lista: ela lê "8" e procura oito turmas na semana.
 */
function resumoDaLista(cadeiras: Cadeira[]): string {
  const ativas = cadeiras.filter((c) => c.ativo).length;
  const arquivadas = cadeiras.length - ativas;
  return `${ativas} ativa(s)${arquivadas > 0 ? ` · ${arquivadas} arquivada(s)` : ''}`;
}

/**
 * Turma arquivada: cartão fechado, e só o caminho de volta.
 *
 * Sem os painéis de plano, horário e alarme de propósito. Numa turma arquivada
 * eles não fazem nada — as séries estão inativas e as aulas futuras canceladas
 * —, e oferecer o ajuste seria prometer um efeito que não vem. Primeiro
 * reativa, depois ajusta.
 */
function CartaoArquivada({
  cadeira,
  carregando,
  onReativar,
}: {
  cadeira: Cadeira;
  carregando: boolean;
  onReativar: () => void;
}) {
  return (
    <Card className="border-dashed bg-muted/30">
      <CardHeader className="flex-row items-center gap-3 space-y-0">
        <span
          className="h-9 w-1.5 shrink-0 rounded-full opacity-40"
          style={{ backgroundColor: cadeira.corHex }}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <CardTitle className="truncate text-base font-medium text-muted-foreground">
            {cadeira.disciplina} · {cadeira.turma}
          </CardTitle>
          <p className="truncate text-xs text-muted-foreground">
            {periodoLetivo(cadeira.anoLetivo, cadeira.semestre)}
            {cadeira.escola ? ` · ${cadeira.escola.nome}` : ''}
          </p>
        </div>
      </CardHeader>
      <CardContent>
        <Confirmar
          titulo={`Reativar ${cadeira.disciplina} · ${cadeira.turma}?`}
          rotuloAcao="Reativar turma"
          carregando={carregando}
          onConfirmar={onReativar}
          descricao={
            <>
              As aulas futuras que o arquivamento cancelou <strong>voltam para a grade</strong>, com
              os alarmes delas. As que hoje batem com outra turma{' '}
              <strong>continuam canceladas</strong> — você não pode estar em duas ao mesmo tempo, e
              o aviso diz qual turma ficou com o horário. O que você tinha cancelado à mão antes de
              arquivar continua cancelado.
            </>
          }
        >
          <Button variant="outline" size="sm" className="w-full">
            <RotateCcw />
            Reativar turma
          </Button>
        </Confirmar>
      </CardContent>
    </Card>
  );
}
