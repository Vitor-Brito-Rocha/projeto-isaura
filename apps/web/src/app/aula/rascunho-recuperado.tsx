'use client';

import { RotateCcw } from 'lucide-react';
import { Confirmar } from '@/components/confirmar';
import { Button } from '@/components/ui/button';

/**
 * O que ela digitou e não salvou, de volta na tela — dizendo que é isso mesmo.
 *
 * O aviso não é enfeite: sem ele ela abre a aula, encontra os campos
 * preenchidos e conclui que já estava salvo. É a mesma classe de mentira que
 * `avisar` evita ao separar "registrada" de "salvo no aparelho", e a mesma que
 * `rascunhoPendente` evita ao marcar o que veio da IA — nos três casos o texto
 * está na tela e não conta como registro.
 *
 * A consequência entra por fora porque ela é diferente em cada campo: o
 * formulário vira histórico, a fala não vira nada até ela pedir o resumo.
 * Dizer "não entra no histórico" na caixa da fala seria dizer algo que não é
 * verdade nem quando ela salva.
 */
export function RascunhoRecuperado({
  consequencia,
  oQueSomeAoDescartar,
  onDescartar,
}: {
  consequencia: string;
  /** O que exatamente se perde. Concreto, não "não pode ser desfeito". */
  oQueSomeAoDescartar: string;
  onDescartar: () => void;
}) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/[0.06] px-3 py-2">
      <RotateCcw className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-xs">
          Recuperamos o que você tinha digitado{' '}
          <strong className="font-medium">e não chegou a salvar</strong>. {consequencia}
        </p>
        <Confirmar
          titulo="Descartar o que não foi salvo?"
          descricao={oQueSomeAoDescartar}
          rotuloAcao="Descartar"
          perigo
          onConfirmar={onDescartar}
        >
          <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs">
            Descartar
          </Button>
        </Confirmar>
      </div>
    </div>
  );
}
