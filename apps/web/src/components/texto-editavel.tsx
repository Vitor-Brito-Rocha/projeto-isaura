'use client';

import { Check, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * Título que vira campo ao clicar.
 *
 * Existe porque renomear precisa ser barato. Sem isto, corrigir "Frações
 * equivalntes" exige apagar e recriar o tópico — e apagar leva junto o vínculo
 * com todas as aulas que já o marcaram como coberto. O histórico dela some por
 * causa de um erro de digitação.
 *
 * Esc cancela e Enter confirma: no celular o teclado ocupa metade da tela e
 * achar um botão "salvar" embaixo dele é pior do que apertar "ok" no próprio
 * teclado.
 */
export function TextoEditavel({
  valor,
  aoSalvar,
  className,
  rotuloAcessivel,
}: {
  valor: string;
  aoSalvar: (novo: string) => void;
  className?: string;
  rotuloAcessivel: string;
}) {
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState(valor);
  const campo = useRef<HTMLInputElement>(null);

  // Se o valor mudar por fora (outra aba, sincronização), o rascunho parado
  // não pode sobrescrever silenciosamente na próxima edição.
  useEffect(() => {
    if (!editando) setRascunho(valor);
  }, [valor, editando]);

  useEffect(() => {
    if (editando) campo.current?.select();
  }, [editando]);

  function confirmar() {
    const limpo = rascunho.trim();
    setEditando(false);
    if (!limpo || limpo === valor) {
      setRascunho(valor); // vazio não apaga o título: cancela
      return;
    }
    aoSalvar(limpo);
  }

  if (!editando) {
    return (
      <button
        type="button"
        onClick={() => setEditando(true)}
        aria-label={`Renomear ${rotuloAcessivel}`}
        className={cn(
          'w-full truncate rounded px-1 text-left hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          className,
        )}
      >
        {valor}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Input
        ref={campo}
        autoFocus
        value={rascunho}
        aria-label={`Novo nome de ${rotuloAcessivel}`}
        onChange={(e) => setRascunho(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') confirmar();
          if (e.key === 'Escape') {
            setRascunho(valor);
            setEditando(false);
          }
        }}
        className="h-9"
      />
      <Button size="icon" variant="ghost" className="size-8 shrink-0" onClick={confirmar}>
        <Check />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="size-8 shrink-0"
        aria-label="Cancelar"
        onClick={() => {
          setRascunho(valor);
          setEditando(false);
        }}
      >
        <X />
      </Button>
    </div>
  );
}
