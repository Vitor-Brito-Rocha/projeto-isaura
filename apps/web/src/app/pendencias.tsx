'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronRight, NotebookPen } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { apiFetch } from '@/lib/api';
import { diaEDataBR } from '@/lib/datas';
import type { Ocorrencia } from '@/lib/types';

const MOSTRA_INICIAL = 4;

/**
 * As aulas que já aconteceram e continuam sem conteúdo escrito.
 *
 * Gravar nunca teve janela de tempo — o que faltava era **achar** a aula depois.
 * Sem esta lista, registrar a terça passada exigia lembrar a data e voltar
 * semana a semana na grade, que é trabalho suficiente para ela desistir. O
 * alarme é um empurrão; esta é a porta de quem não conseguiu atender.
 *
 * Some inteiro quando não há pendência: cartaz de "tudo em dia" toda semana
 * vira ruído, e ruído é o que faz alarme virar alarme nenhum.
 */
export function Pendencias() {
  const [tudo, setTudo] = useState(false);

  const { data } = useQuery({
    queryKey: ['pendencias'],
    queryFn: () => apiFetch<Ocorrencia[]>('/agenda/pendencias?dias=45'),
  });

  if (!data?.length) return null;

  const visiveis = tudo ? data : data.slice(0, MOSTRA_INICIAL);

  return (
    <Card className="mb-4 border-amber-500/40 bg-amber-500/[0.06]">
      <CardContent className="space-y-2 py-3">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <NotebookPen className="size-4" aria-hidden />
          {data.length === 1 ? '1 aula sem registro' : `${data.length} aulas sem registro`}
        </p>
        <p className="text-xs text-muted-foreground">
          Não deu para escrever na hora? Dá para registrar agora, sem prazo.
        </p>

        <ul className="divide-y divide-border/60">
          {visiveis.map((oc) => (
            <li key={oc.id}>
              <Link
                href={`/aula?ocorrencia=${oc.id}&momento=fechamento`}
                className="flex items-center gap-2 py-2 text-sm hover:opacity-80"
              >
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: oc.cadeira.corHex }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate">
                  {oc.cadeira.disciplina} · {oc.cadeira.turma}
                </span>
                {/* O plano previsto sobrevivendo sozinho é o sinal de que ela
                    respondeu a abertura e não voltou no fechamento. */}
                {oc.registro?.planoPrevisto && (
                  <Badge variant="outline" className="hidden font-normal sm:inline-flex">
                    tem plano
                  </Badge>
                )}
                <span className="shrink-0 text-xs text-muted-foreground">
                  {diaEDataBR(oc.data)}
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>

        {data.length > MOSTRA_INICIAL && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-full px-2"
            onClick={() => setTudo((t) => !t)}
          >
            {tudo ? 'Mostrar menos' : `Ver as outras ${data.length - MOSTRA_INICIAL}`}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
