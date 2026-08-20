'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarRange, FileSearch, Sparkles, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiFetch } from '@/lib/api';
import { dataBR, diaDaSemanaBR } from '@/lib/datas';
import type { Anexo, Cadeira } from '@/lib/types';

interface UnidadeProposta {
  titulo: string;
  topicos: string[];
  cargaHoraria?: number;
  dataInicio?: string;
  dataFimPrevista?: string;
  aulas?: number;
}

interface Horario {
  diaSemana: number;
  horaInicio: string;
  horaFim: string;
}

interface Proposta {
  /** `unifor` = lido por parser. Muda o que a tela promete — ver `avisoDaOrigem`. */
  origem: 'unifor' | 'modelo';
  paginas: number;
  unidades: UnidadeProposta[];
  grade: Horario[] | null;
  encontros: string[];
  identificacao: {
    disciplina: string | null;
    codigoTurma: string | null;
    ano: number | null;
    semestre: number | null;
  } | null;
}

/**
 * O aviso muda com a origem, e isso não é detalhe.
 *
 * "Saída de IA — confira" num documento lido por parser seria mentira na
 * direção mais cara: ela desconfiaria de um dado exato. E o contrário — omitir
 * o aviso quando o modelo leu — é a mentira que este projeto menos pode dar,
 * porque a unidade errada contamina todo registro que apontar para ela.
 */
function avisoDaOrigem(origem: Proposta['origem']): string {
  return origem === 'unifor'
    ? 'Lido direto do documento, sem IA. Confira e desmarque o que não quiser criar.'
    : 'Saída de IA — confira antes de criar. Desmarque o que não for unidade; o texto você ajusta depois, na lista.';
}

/** "ter, 11:20–13:00" — o dia vem do calendário e não se edita. */
function rotuloDoHorario(h: Horario): string {
  // Uma data qualquer daquele dia da semana serve para o nome sair traduzido.
  const referencia = new Date(Date.UTC(2024, 0, 7 + h.diaSemana));
  return `${diaDaSemanaBR(referencia)}, ${h.horaInicio}–${h.horaFim}`;
}

/**
 * Lê o PDF do plano de curso e propõe as unidades — e, quando o documento traz,
 * o cronograma e a grade.
 *
 * **Nada é gravado até ela confirmar.** O rascunho vive só nesta tela: um plano
 * importado com a unidade 3 errada contamina todo registro que apontar para
 * ela, e o erro só aparece meses depois, quando ela for olhar o progresso da
 * turma. Por isso a lista chega com tudo marcado mas desmarcável, e só o botão
 * de confirmar cria alguma coisa.
 *
 * As datas de cada unidade são **estimadas** pelas horas-aula declaradas, não
 * copiadas do cronograma do documento — a razão está em `ia/unifor.ts`. São
 * editáveis aqui porque é o único lugar onde ela as vê antes de existirem, e
 * porque é delas que sai o aviso de ritmo na tela de progresso.
 */
export function ImportarPlano({ planoId, onImportou }: { planoId: string; onImportou: () => void }) {
  const qc = useQueryClient();
  const [proposta, setProposta] = useState<Proposta | null>(null);
  const [fora, setFora] = useState<Set<number>>(new Set());
  const [cadeiraId, setCadeiraId] = useState('');
  // A proposta sobrevive ao passo das unidades quando ainda há grade a criar, e
  // sem esta marca o botão continuaria clicável — o segundo clique criaria o
  // plano inteiro de novo, em duplicata, sem nada avisando.
  const [unidadesCriadas, setUnidadesCriadas] = useState(false);

  const { data: ia } = useQuery({
    queryKey: ['ia', 'status'],
    queryFn: () => apiFetch<{ resumo: boolean; provedor: string | null }>('/ia/status'),
    staleTime: Infinity,
  });

  // Mesma chave do componente de anexos: a lista já está em cache.
  const { data: anexos } = useQuery({
    queryKey: ['anexos', 'plano', planoId],
    queryFn: () => apiFetch<Anexo[]>(`/planos/${planoId}/anexos`),
  });

  const { data: cadeiras } = useQuery({
    queryKey: ['cadeiras'],
    queryFn: () => apiFetch<Cadeira[]>('/cadeiras'),
    enabled: Boolean(proposta?.grade),
  });

  const extrair = useMutation({
    mutationFn: (anexoId: string) =>
      apiFetch<Proposta>(`/ia/plano/${planoId}/anexo/${anexoId}/extrair`, { method: 'POST' }),
    onSuccess: (r) => {
      setFora(new Set());
      setUnidadesCriadas(false);
      setProposta(r);
      if (r.unidades.length === 0) {
        toast.warning('Não achei unidades neste documento.', {
          description: 'Ele continua guardado aqui, e as unidades você cadastra na mão.',
        });
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Não foi possível ler o PDF.'),
  });

  const confirmar = useMutation({
    mutationFn: (unidades: UnidadeProposta[]) =>
      apiFetch(`/planos/${planoId}/unidades/importar`, {
        method: 'POST',
        body: JSON.stringify({
          unidades: unidades.map((u) => ({
            titulo: u.titulo,
            topicos: u.topicos,
            dataInicio: u.dataInicio,
            dataFimPrevista: u.dataFimPrevista,
          })),
        }),
      }),
    onSuccess: (_r, unidades) => {
      setUnidadesCriadas(true);
      qc.invalidateQueries({ queryKey: ['plano', planoId] });
      onImportou();
      toast.success(
        unidades.length === 1 ? '1 unidade criada.' : `${unidades.length} unidades criadas.`,
      );
      // A proposta SOBREVIVE ao passo das unidades quando ainda há grade para
      // criar: limpar aqui obrigaria a ler o PDF de novo só para chegar no
      // segundo botão, e o calendário é o que ela não tem como redigitar.
      if (!proposta?.grade) setProposta(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Não foi possível criar.'),
  });

  const criarGrade = useMutation({
    mutationFn: () =>
      apiFetch<{ criadas: number }>('/series/calendario', {
        method: 'POST',
        body: JSON.stringify({
          cadeiraId,
          horarios: proposta?.grade ?? [],
          datas: proposta?.encontros ?? [],
        }),
      }),
    onSuccess: (r) => {
      setProposta(null);
      qc.invalidateQueries({ queryKey: ['agenda'] });
      qc.invalidateQueries({ queryKey: ['cadeiras'] });
      toast.success(`${r.criadas} aula(s) na grade.`, {
        description: 'Os alarmes já valem para elas.',
      });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Não foi possível criar a grade.'),
  });

  const pdfs = (anexos ?? []).filter((a) => a.nomeArquivo.toLowerCase().endsWith('.pdf'));
  if (!ia?.resumo || pdfs.length === 0) return null;

  const escolhidas = (proposta?.unidades ?? []).filter((_, i) => !fora.has(i));

  function mudarData(i: number, campo: 'dataInicio' | 'dataFimPrevista', valor: string) {
    setProposta((atual) =>
      atual
        ? {
            ...atual,
            unidades: atual.unidades.map((u, j) => (i === j ? { ...u, [campo]: valor } : u)),
          }
        : atual,
    );
  }

  function mudarHora(i: number, campo: 'horaInicio' | 'horaFim', valor: string) {
    setProposta((atual) =>
      atual?.grade
        ? {
            ...atual,
            grade: atual.grade.map((h, j) => (i === j ? { ...h, [campo]: valor } : h)),
          }
        : atual,
    );
  }

  return (
    <div className="space-y-3 border-t pt-3">
      {proposta === null ? (
        <>
          <p className="text-xs text-muted-foreground">
            Dá para ler as unidades direto do PDF. Você confere antes de qualquer coisa ser criada.
          </p>
          <div className="flex flex-wrap gap-2">
            {pdfs.map((a) => (
              <Button
                key={a.id}
                size="sm"
                variant="outline"
                loading={extrair.isPending && extrair.variables === a.id}
                onClick={() => extrair.mutate(a.id)}
              >
                <FileSearch />
                Ler {a.nomeArquivo}
              </Button>
            ))}
          </div>
        </>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <Sparkles className="size-4 text-muted-foreground" aria-hidden />
              {proposta.unidades.length === 0
                ? 'Nada encontrado'
                : `${proposta.unidades.length} unidade(s) no documento`}
            </p>
            <Button
              size="icon"
              variant="ghost"
              className="size-8"
              aria-label="Descartar proposta"
              onClick={() => setProposta(null)}
            >
              <X className="size-4" />
            </Button>
          </div>

          {proposta.identificacao?.disciplina && (
            <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
              <strong className="font-medium text-foreground">
                {proposta.identificacao.disciplina}
              </strong>
              {proposta.identificacao.codigoTurma && ` · ${proposta.identificacao.codigoTurma}`}
              {proposta.identificacao.ano && ` · ${proposta.identificacao.ano}`}
              {proposta.identificacao.semestre && `.${proposta.identificacao.semestre}`}
            </p>
          )}

          {proposta.unidades.length > 0 && unidadesCriadas && (
            <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
              Unidades criadas. Elas estão na lista acima — falta só a grade.
            </p>
          )}

          {proposta.unidades.length > 0 && !unidadesCriadas && (
            <>
              <p className="text-xs text-muted-foreground">{avisoDaOrigem(proposta.origem)}</p>

              <ul className="space-y-1.5">
                {proposta.unidades.map((u, i) => (
                  <li key={i} className="rounded-md border px-3 py-2">
                    <label className="flex cursor-pointer items-start gap-2">
                      <input
                        type="checkbox"
                        className="mt-1 size-4 shrink-0"
                        checked={!fora.has(i)}
                        onChange={() =>
                          setFora((atual) => {
                            const novo = new Set(atual);
                            if (novo.has(i)) novo.delete(i);
                            else novo.add(i);
                            return novo;
                          })
                        }
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{u.titulo}</span>
                        {u.topicos.length > 0 && (
                          <span className="block text-xs text-muted-foreground">
                            {u.topicos.join(' · ')}
                          </span>
                        )}
                      </span>
                    </label>

                    {u.dataInicio && u.dataFimPrevista && !fora.has(i) && (
                      <div className="mt-2 space-y-1.5 border-t pt-2">
                        <p className="text-xs text-muted-foreground">
                          Estimado
                          {u.cargaHoraria ? ` por ${u.cargaHoraria} h/a` : ''}
                          {u.aulas ? `: ${u.aulas} aula(s)` : ''} — {dataBR(u.dataInicio)} a{' '}
                          {dataBR(u.dataFimPrevista)}. É desta data que sai o aviso de ritmo.
                        </p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <Input
                            type="date"
                            aria-label={`Início da unidade ${u.titulo}`}
                            value={u.dataInicio}
                            onChange={(e) => mudarData(i, 'dataInicio', e.target.value)}
                          />
                          <Input
                            type="date"
                            aria-label={`Fim previsto da unidade ${u.titulo}`}
                            value={u.dataFimPrevista}
                            onChange={(e) => mudarData(i, 'dataFimPrevista', e.target.value)}
                          />
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>

              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  loading={confirmar.isPending}
                  disabled={escolhidas.length === 0}
                  onClick={() => confirmar.mutate(escolhidas)}
                >
                  Criar {escolhidas.length} unidade(s)
                </Button>
                <Button size="sm" variant="outline" onClick={() => setProposta(null)}>
                  Descartar
                </Button>
              </div>

              {/* Acrescenta ao fim, não substitui: o plano pode já ter unidade
                  digitada na mão, e importar não é motivo para apagá-la. */}
              <p className="text-xs text-muted-foreground">
                Entram no fim da lista. O que você já tinha cadastrado fica.
              </p>
            </>
          )}

          {proposta.grade && proposta.encontros.length > 0 && (
            <div className="space-y-2 rounded-md border border-dashed bg-muted/30 p-3">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <CalendarRange className="size-4 text-muted-foreground" aria-hidden />
                {proposta.encontros.length} aulas no calendário do documento
              </p>
              <p className="text-xs text-muted-foreground">
                De {dataBR(proposta.encontros[0])} a{' '}
                {dataBR(proposta.encontros[proposta.encontros.length - 1])}, com os dias sem aula já
                de fora. Os alarmes passam a valer para elas.
              </p>

              <div className="space-y-2">
                {proposta.grade.map((h, i) => (
                  <div key={h.diaSemana} className="space-y-1">
                    {/* O dia vem das datas e não se edita: mudá-lo aqui deixaria
                        o calendário e o horário discordando, e a API recusa. */}
                    <Label className="block text-xs">{rotuloDoHorario(h)}</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        type="time"
                        aria-label={`Início — ${rotuloDoHorario(h)}`}
                        value={h.horaInicio}
                        onChange={(e) => mudarHora(i, 'horaInicio', e.target.value)}
                      />
                      <Input
                        type="time"
                        aria-label={`Fim — ${rotuloDoHorario(h)}`}
                        value={h.horaFim}
                        onChange={(e) => mudarHora(i, 'horaFim', e.target.value)}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cadeira-da-grade" className="block text-xs">
                  Em qual turma
                </Label>
                <select
                  id="cadeira-da-grade"
                  value={cadeiraId}
                  onChange={(e) => setCadeiraId(e.target.value)}
                  className="flex h-11 w-full rounded-md border border-input bg-card px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm"
                >
                  <option value="">— escolha —</option>
                  {(cadeiras ?? [])
                    .filter((c) => c.ativo)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.disciplina} · {c.turma}
                      </option>
                    ))}
                </select>
              </div>

              <Button
                size="sm"
                className="w-full"
                loading={criarGrade.isPending}
                disabled={!cadeiraId}
                onClick={() => criarGrade.mutate()}
              >
                Criar as {proposta.encontros.length} aulas
              </Button>

              {/* O documento descreve um calendário, não uma regra semanal. Sem
                  isto ela procuraria a série no painel de horários da cadeira e
                  não acharia — e concluiria que a importação não funcionou. */}
              <p className="text-xs text-muted-foreground">
                As aulas nascem nas datas exatas do documento, uma a uma — não como horário fixo
                que se repete. Cada uma você cancela ou remarca pela tela da aula.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
