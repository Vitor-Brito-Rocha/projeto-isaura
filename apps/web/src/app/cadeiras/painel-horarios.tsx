'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, CopyPlus, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Confirmar } from '@/components/confirmar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { apiFetch } from '@/lib/api';
import { dataBR, diaEDataBR } from '@/lib/datas';
import {
  DIAS,
  FAIXA_PADRAO,
  FREQUENCIAS,
  diaSemanaDe,
  faixaInvalida,
  horariosDoRascunho,
  juntarDias,
  notaFrequencia,
  ofertaDeRepeticao,
  rascunhoSerieDe,
  rascunhoSerieNovo,
  repetirFaixa,
  resumoHorarios,
  rotuloFrequencia,
  type RascunhoSerie,
} from '@/lib/horarios';
import type { Frequencia, Serie } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * Onde a professora define quando a aula acontece.
 *
 * Existia API para isto desde a fase 1 e nunca existiu tela: a grade só se
 * enchia pelo script de dados de teste, o que na prática deixava o produto sem
 * porta de entrada — sem série, não há ocorrência, e sem ocorrência não há
 * alarme nem registro.
 */
export function PainelHorarios({
  cadeiraId,
  series,
}: {
  cadeiraId: string;
  /** Já filtradas para esta cadeira pela tela — uma requisição para todas. */
  series: Serie[];
}) {
  const qc = useQueryClient();
  const [editando, setEditando] = useState<string | 'nova' | null>(null);

  const recarregar = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['series'] }),
      qc.invalidateQueries({ queryKey: ['cadeiras'] }),
      // A grade é o que ela vai conferir logo depois de salvar; sem isto a
      // semana continua mostrando o estado anterior até o próximo refetch.
      qc.invalidateQueries({ queryKey: ['agenda'] }),
      qc.invalidateQueries({ queryKey: ['pendencias'] }),
    ]);
  };

  const salvar = useMutation({
    mutationFn: ({ id, rascunho }: { id: string | 'nova'; rascunho: RascunhoSerie }) => {
      const corpo = {
        frequencia: rascunho.frequencia,
        dataInicio: rascunho.dataInicio,
        ...(rascunho.dataFim ? { dataFim: rascunho.dataFim } : {}),
        horarios: horariosDoRascunho(rascunho),
      };
      return id === 'nova'
        ? apiFetch('/series', { method: 'POST', body: JSON.stringify({ cadeiraId, ...corpo }) })
        : apiFetch(`/series/${id}`, { method: 'PATCH', body: JSON.stringify(corpo) });
    },
    onSuccess: async () => {
      await recarregar();
      setEditando(null);
      toast.success('Grade atualizada.');
    },
    /**
     * Erro de grade não é aviso, é instrução — e ela precisa dele na tela
     * enquanto conserta. "Choca com Matemática · 8º A, segunda, 24/08" some em
     * quatro segundos, e aí a pergunta ("chocava com qual mesmo?") já não tem
     * resposta na tela. Fica até ela fechar.
     */
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : 'Não foi possível salvar.', {
        duration: Infinity,
        closeButton: true,
      }),
  });

  const remover = useMutation({
    mutationFn: (id: string) => apiFetch(`/series/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await recarregar();
      toast.success('Horário removido. As aulas já registradas ficam no histórico.');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Não foi possível remover.'),
  });

  return (
    <div className="space-y-2 border-t pt-3">
      <div className="flex items-center justify-between gap-2">
        <Label className="flex items-center gap-1.5">
          <CalendarClock className="size-4 text-muted-foreground" aria-hidden />
          Dias e horários
        </Label>
        {editando === null && (
          <Button variant="ghost" size="sm" className="h-8" onClick={() => setEditando('nova')}>
            <Plus />
            {series.length === 0 ? 'Definir' : 'Adicionar'}
          </Button>
        )}
      </div>

      {series.length === 0 && editando === null && (
        <p className="text-xs text-muted-foreground">
          Sem dias definidos, esta cadeira não gera aula nenhuma na grade — e sem aula não há
          alarme nem registro.
        </p>
      )}

      <ul className="space-y-2">
        {series.map((s) =>
          editando === s.id ? (
            <li key={s.id}>
              <Editor
                titulo="Editar horário"
                inicial={rascunhoSerieDe(s)}
                salvando={salvar.isPending}
                onCancelar={() => setEditando(null)}
                onSalvar={(rascunho) => salvar.mutate({ id: s.id, rascunho })}
              />
            </li>
          ) : (
            <li
              key={s.id}
              className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border bg-muted/30 px-3 py-2"
            >
              <span className="text-sm tabular-nums">{resumoHorarios(s.horarios)}</span>
              <Badge variant="neutro" className="font-normal">
                {rotuloFrequencia(s.frequencia)}
              </Badge>
              <span className="text-xs text-muted-foreground">
                desde {dataBR(s.dataInicio)}
                {s.dataFim ? ` até ${dataBR(s.dataFim)}` : ''}
              </span>
              <div className="ml-auto flex items-center">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label="Editar horário"
                  onClick={() => setEditando(s.id)}
                >
                  <Pencil className="size-4" />
                </Button>
                <Confirmar
                  titulo="Remover este horário?"
                  perigo
                  rotuloAcao="Remover"
                  carregando={remover.isPending}
                  onConfirmar={() => remover.mutate(s.id)}
                  descricao={
                    <>
                      As aulas futuras desta série somem da grade e param de tocar alarme. As que
                      já aconteceram <strong>continuam no histórico</strong>, com tudo o que você
                      registrou nelas.
                    </>
                  }
                >
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground hover:text-destructive"
                    aria-label="Remover horário"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </Confirmar>
              </div>
            </li>
          ),
        )}
      </ul>

      {editando === 'nova' && (
        <Editor
          titulo="Novo horário"
          inicial={rascunhoSerieNovo()}
          salvando={salvar.isPending}
          onCancelar={() => setEditando(null)}
          onSalvar={(rascunho) => salvar.mutate({ id: 'nova', rascunho })}
        />
      )}
    </div>
  );
}

/**
 * Exportado para o teste de montagem: é a parte da tela que só existe depois de
 * um clique, e `renderToStaticMarkup` do painel nunca chegaria nela.
 */
export function Editor({
  titulo,
  inicial,
  salvando,
  onSalvar,
  onCancelar,
}: {
  titulo: string;
  inicial: RascunhoSerie;
  salvando: boolean;
  onSalvar: (r: RascunhoSerie) => void;
  onCancelar: () => void;
}) {
  const [r, setR] = useState<RascunhoSerie>(inicial);
  /**
   * Os dias cujo horário ELA digitou — não os que herdaram.
   *
   * É o que separa "ainda não mexi nos outros" de "cada dia tem a sua hora", e
   * decide se a oferta de repetir aparece. Ver `ofertaDeRepeticao`.
   */
  const [tocados, setTocados] = useState<number[]>([]);
  const pontual = r.frequencia === 'PONTUAL';

  const selecionados = Object.keys(r.dias).map(Number).sort((a, b) => a - b);
  const faixaPontual = Object.values(r.dias)[0] ?? FAIXA_PADRAO;

  const alternarDia = (n: number) => {
    // Desmarcar apaga a marca de "mexido": a hora dele saiu da tela junto.
    setTocados((t) => t.filter((x) => x !== n));
    setR((atual) => {
      const dias = { ...atual.dias };
      if (dias[n]) {
        delete dias[n];
        return { ...atual, dias };
      }
      // Herda a faixa do último dia marcado: o caso comum é a mesma hora em
      // todos os dias, e redigitar 07:00–07:50 a cada dia é o atrito que faz
      // desistir na terceira cadeira.
      const ultimo = Object.values(atual.dias).pop() ?? FAIXA_PADRAO;
      dias[n] = { ...ultimo };
      return { ...atual, dias };
    });
  };

  const mudarFaixa = (n: number, campo: 'horaInicio' | 'horaFim', valor: string) => {
    setTocados((t) => (t.includes(n) ? t : [...t, n]));
    setR((atual) => ({
      ...atual,
      // `slice(0, 5)`: com `step` menor que 60 o campo devolve "HH:mm:ss", que a
      // API recusa pelo formato.
      dias: { ...atual.dias, [n]: { ...atual.dias[n], [campo]: valor.slice(0, 5) } },
    }));
  };

  const oferta = pontual ? null : ofertaDeRepeticao(r.dias, tocados);

  const repetirEmTodos = () => {
    if (!oferta) return;
    setR((atual) => ({ ...atual, dias: repetirFaixa(atual.dias, oferta.faixa) }));
    // Zera a marca: os dias voltaram a estar iguais, e a próxima correção dela
    // é um gesto novo que merece a mesma oferta.
    setTocados([]);
  };

  const horarios = horariosDoRascunho(r);
  const invalidos = horarios.filter((h) => faixaInvalida(h.horaInicio, h.horaFim));
  const semDia = !pontual && selecionados.length === 0;
  const podeSalvar = !semDia && invalidos.length === 0 && Boolean(r.dataInicio);
  const nota = notaFrequencia(r.frequencia);

  return (
    <form
      className="space-y-4 rounded-md border bg-card p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (podeSalvar) onSalvar(r);
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{titulo}</p>
        <Button type="button" variant="ghost" size="icon" className="size-8" onClick={onCancelar}>
          <X className="size-4" />
          <span className="sr-only">Cancelar</span>
        </Button>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="frequencia">Com que frequência</Label>
        <Select
          value={r.frequencia}
          onValueChange={(v) => setR((a) => ({ ...a, frequencia: v as Frequencia }))}
        >
          <SelectTrigger id="frequencia">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FREQUENCIAS.map((f) => (
              <SelectItem key={f.valor} value={f.valor}>
                {f.rotulo}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {nota && <p className="text-xs text-muted-foreground">{nota}</p>}
      </div>

      {!pontual && (
        <div className="space-y-2">
          <Label>Em que dias</Label>
          <div className="flex flex-wrap gap-1.5">
            {DIAS.map((d) => {
              const marcado = Boolean(r.dias[d.n]);
              return (
                <button
                  key={d.n}
                  type="button"
                  aria-pressed={marcado}
                  onClick={() => alternarDia(d.n)}
                  className={cn(
                    'h-10 min-w-11 rounded-md border px-2 text-sm font-medium capitalize transition-colors',
                    marcado
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'bg-card text-muted-foreground hover:bg-accent',
                  )}
                >
                  {d.curto}
                </button>
              );
            })}
          </div>
          {semDia && (
            <p className="text-xs text-muted-foreground">Escolha pelo menos um dia da semana.</p>
          )}
        </div>
      )}

      {pontual ? (
        <FaixaHora
          id="pontual"
          rotulo="Horário"
          faixa={faixaPontual}
          onChange={(campo, v) => mudarFaixa(diaSemanaDe(r.dataInicio), campo, v)}
        />
      ) : (
        selecionados.map((n) => (
          <FaixaHora
            key={n}
            id={String(n)}
            rotulo={DIAS.find((d) => d.n === n)!.longo}
            faixa={r.dias[n]}
            onChange={(campo, v) => mudarFaixa(n, campo, v)}
          />
        ))
      )}

      {/*
        Oferta, não automatismo: mudar sozinho o horário de dias que ela não
        tocou é exatamente o tipo de ajuda que faz perder a confiança no
        sistema. O botão diz a hora e diz quais dias mudam, então o que vai
        acontecer está escrito antes do toque.
      */}
      {oferta && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed bg-muted/40 px-3 py-2">
          <span className="min-w-0 flex-1 text-xs text-muted-foreground">
            Os outros dias ainda estão em outro horário.
          </span>
          <Button type="button" size="sm" variant="outline" onClick={repetirEmTodos}>
            <CopyPlus />
            Usar {oferta.faixa.horaInicio}–{oferta.faixa.horaFim} {'em '}
            {juntarDias(oferta.dias)}
          </Button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="inicio">{pontual ? 'Dia da aula' : 'A partir de'}</Label>
          <Input
            id="inicio"
            type="date"
            required
            value={r.dataInicio}
            onChange={(e) => setR((a) => ({ ...a, dataInicio: e.target.value }))}
          />
          {/* O seletor nativo desenha no formato do sistema operacional — num
              aparelho em inglês, MM/DD/YYYY. O que vale é o que está escrito. */}
          {r.dataInicio && (
            <p className="text-xs text-muted-foreground">{diaEDataBR(r.dataInicio)}</p>
          )}
        </div>
        {!pontual && (
          <div className="space-y-1.5">
            <Label htmlFor="fim">Até (opcional)</Label>
            <Input
              id="fim"
              type="date"
              value={r.dataFim}
              onChange={(e) => setR((a) => ({ ...a, dataFim: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">
              {r.dataFim ? diaEDataBR(r.dataFim) : 'Em branco, segue até você mudar.'}
            </p>
          </div>
        )}
      </div>

      {invalidos.length > 0 && (
        <p className="text-xs text-destructive">
          O fim precisa ser depois do início em todos os dias marcados.
        </p>
      )}

      {podeSalvar && (
        <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          Vai gerar: <strong className="font-medium text-foreground">{resumoHorarios(horarios)}</strong>,{' '}
          {rotuloFrequencia(r.frequencia).toLowerCase()}.
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={salvando} disabled={!podeSalvar}>
          Salvar
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancelar}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function FaixaHora({
  id,
  rotulo,
  faixa,
  onChange,
}: {
  id: string;
  rotulo: string;
  faixa: { horaInicio: string; horaFim: string };
  onChange: (campo: 'horaInicio' | 'horaFim', valor: string) => void;
}) {
  const erro = faixaInvalida(faixa.horaInicio, faixa.horaFim);

  return (
    <div className="flex flex-wrap items-end gap-2">
      <p className="w-full text-xs font-medium capitalize text-muted-foreground sm:w-28">{rotulo}</p>
      <div className="space-y-1">
        <Label htmlFor={`ini-${id}`} className="text-xs font-normal text-muted-foreground">
          Começa
        </Label>
        <Input
          id={`ini-${id}`}
          type="time"
          required
          className={cn('w-32', erro && 'border-destructive')}
          value={faixa.horaInicio}
          onChange={(e) => onChange('horaInicio', e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`fim-${id}`} className="text-xs font-normal text-muted-foreground">
          Termina
        </Label>
        <Input
          id={`fim-${id}`}
          type="time"
          required
          className={cn('w-32', erro && 'border-destructive')}
          value={faixa.horaFim}
          onChange={(e) => onChange('horaFim', e.target.value)}
        />
      </div>
    </div>
  );
}
