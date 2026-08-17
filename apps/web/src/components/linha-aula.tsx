'use client';

import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type { Ocorrencia } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * Para onde o toque na aula leva.
 *
 * Aula que já terminou abre no fechamento — a pergunta é "o que você deu". Aula
 * que ainda vem abre na abertura, onde ela planeja. É a mesma escolha que o
 * alarme faz, e o motivo de a tela não depender dele: registrar nunca teve
 * janela de tempo, só faltava um caminho até aqui que não fosse a notificação.
 */
export function momentoDe(oc: Ocorrencia): 'abertura' | 'fechamento' {
  return new Date(oc.fimEm) < new Date() ? 'fechamento' : 'abertura';
}

export function linkDaAula(oc: Ocorrencia): string {
  return `/aula/${oc.id}?momento=${momentoDe(oc)}`;
}

/** Uma aula na grade — em lista ou no dia aberto do calendário. */
export function LinhaAula({ ocorrencia: oc }: { ocorrencia: Ocorrencia }) {
  const cancelada = oc.status === 'CANCELADA' || oc.status === 'FERIADO';

  return (
    // O cartão já tinha `hover:bg-accent/40` e não abria nada: prometia um
    // toque que não existia. A grade é a tela principal, e era a única sem
    // caminho para o registro — só o alarme e a lista de pendências levavam lá.
    <Link href={linkDaAula(oc)} className="block">
      <Card
        className={cn(
          'flex items-center gap-3 p-3 transition-colors hover:bg-accent/40',
          cancelada && 'opacity-60',
        )}
      >
        <span
          className="h-11 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: oc.cadeira.corHex }}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className={cn('truncate font-medium', cancelada && 'line-through')}>
            {oc.cadeira.disciplina} · {oc.cadeira.turma}
          </p>
          <p className="tabular text-sm text-muted-foreground">
            {oc.horaInicio} – {oc.horaFim}
          </p>
        </div>
        <EtiquetaEstado ocorrencia={oc} />
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </Card>
    </Link>
  );
}

/** O estado da aula em uma palavra — é o que ela precisa ver de relance. */
export function EtiquetaEstado({ ocorrencia: oc }: { ocorrencia: Ocorrencia }) {
  if (oc.status === 'CANCELADA') return <Badge variant="neutro">Cancelada</Badge>;
  if (oc.status === 'FERIADO') return <Badge variant="neutro">Feriado</Badge>;
  if (oc.registro?.conteudoDado) return <Badge variant="sucesso">Registrada</Badge>;
  if (oc.registro?.planoPrevisto) return <Badge>Planejada</Badge>;
  // Aula que já passou sem registro é exatamente o que o produto existe para
  // evitar — por isso ganha a cor de alarme.
  if (new Date(oc.fimEm) < new Date()) return <Badge variant="alarme">Sem registro</Badge>;
  return null;
}

/**
 * Já tem conteúdo escrito.
 *
 * É o que a bolinha do calendário preenche. Aula futura ainda não tem, e por
 * isso nasce vazada — a primeira versão preenchia tudo que "não era pendência",
 * o que fazia a aula de amanhã parecer registrada.
 */
export function temRegistro(oc: Ocorrencia): boolean {
  return Boolean(oc.registro?.conteudoDado);
}

/**
 * Aula que já terminou e não virou registro.
 *
 * Sinal separado do de cima de propósito: a bolinha responde "eu escrevi?" e o
 * número do dia responde "está atrasado?". Misturar os dois numa marca só
 * obrigaria a inventar uma terceira forma para o caso "ainda vai acontecer".
 */
export function estaAtrasada(oc: Ocorrencia): boolean {
  if (oc.status === 'CANCELADA' || oc.status === 'FERIADO') return false;
  return new Date(oc.fimEm) < new Date() && !temRegistro(oc);
}

export function foraDoAr(oc: Ocorrencia): boolean {
  return oc.status === 'CANCELADA' || oc.status === 'FERIADO';
}
