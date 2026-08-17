'use client';

import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Cadeira } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * Escolher turmas em conjunto, agrupadas pela disciplina.
 *
 * O seletor antigo era um `<select>` de uma turma só, e com ele "exportar
 * Matemática" eram quatro exportações coladas à mão — o pedido não era
 * atendível, não era só incômodo.
 *
 * Agrupar por disciplina não é enfeite: é a unidade em que ela pensa quando a
 * coordenação pede. O nome da disciplina é clicável e marca ou desmarca as
 * turmas dela de uma vez; as turmas continuam individuais para o caso de ela
 * querer três das quatro.
 *
 * Nenhuma marcada = todas, e a tela diz isso em texto — a alternativa seria
 * marcar as onze por padrão, que transforma "quero uma" em dez toques.
 */
export function FiltroDeTurmas({
  cadeiras,
  escolhidas,
  onMudar,
}: {
  cadeiras: Cadeira[];
  escolhidas: string[];
  onMudar: (ids: string[]) => void;
}) {
  const porDisciplina = new Map<string, Cadeira[]>();
  for (const c of cadeiras) {
    porDisciplina.set(c.disciplina, [...(porDisciplina.get(c.disciplina) ?? []), c]);
  }

  const marcada = (id: string) => escolhidas.includes(id);

  const alternar = (id: string) =>
    onMudar(marcada(id) ? escolhidas.filter((x) => x !== id) : [...escolhidas, id]);

  const alternarGrupo = (turmas: Cadeira[]) => {
    const ids = turmas.map((t) => t.id);
    const todasMarcadas = ids.every(marcada);
    onMudar(
      todasMarcadas
        ? escolhidas.filter((x) => !ids.includes(x))
        : [...new Set([...escolhidas, ...ids])],
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">Turmas</span>
        {escolhidas.length > 0 && (
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onMudar([])}>
            Limpar
          </Button>
        )}
      </div>

      <div className="space-y-2">
        {[...porDisciplina.entries()].map(([disciplina, turmas]) => {
          const todas = turmas.every((t) => marcada(t.id));
          return (
            <div key={disciplina} className="space-y-1">
              <button
                type="button"
                onClick={() => alternarGrupo(turmas)}
                className="text-xs font-medium text-muted-foreground underline-offset-2 hover:underline"
              >
                {disciplina}
                {turmas.length > 1 && ` (${todas ? 'desmarcar' : 'marcar'} as ${turmas.length})`}
              </button>
              <div className="flex flex-wrap gap-1.5">
                {turmas.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={marcada(c.id)}
                    onClick={() => alternar(c.id)}
                    className={cn(
                      'inline-flex min-h-9 items-center gap-1 rounded-full border px-3 text-sm transition-colors',
                      marcada(c.id)
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'hover:bg-accent',
                    )}
                  >
                    {marcada(c.id) && <Check className="size-3.5" aria-hidden />}
                    {c.turma}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        {escolhidas.length === 0
          ? 'Nenhuma marcada — vale para todas as turmas.'
          : `${escolhidas.length} turma(s) no recorte.`}
      </p>
    </div>
  );
}
