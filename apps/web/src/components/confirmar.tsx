'use client';

import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Confirmação antes de desfazer trabalho.
 *
 * Vale para cancelamento, exclusão e qualquer edição que apague o que ela
 * escreveu. O que está em jogo aqui não é um clique a mais: é o registro de uma
 * aula que ela deu, que não tem como reconstruir depois — o anexo é o único
 * material que sobrou daquela lousa, e o histórico pode virar prova de trabalho
 * na frente da coordenação.
 *
 * **`AlertDialog` e não `Dialog`**: o alerta obriga uma escolha — não fecha ao
 * clicar fora e não tem X no canto. Fechar sem responder é justamente o gesto
 * que produziria o acidente que a caixa existe para evitar.
 *
 * **E não `window.confirm`**: o nativo não deixa dizer o que exatamente some,
 * fica fora do estilo do app e, no celular, aparece com o endereço do site na
 * frente — parecendo um golpe.
 */
export function Confirmar({
  titulo,
  descricao,
  rotuloAcao = 'Confirmar',
  rotuloCancelar = 'Voltar',
  perigo = false,
  carregando = false,
  onConfirmar,
  children,
}: {
  titulo: string;
  /** O que acontece de irreversível. Concreto, não "esta ação não pode ser desfeita". */
  descricao: React.ReactNode;
  rotuloAcao?: string;
  rotuloCancelar?: string;
  perigo?: boolean;
  carregando?: boolean;
  onConfirmar: () => void;
  /** O gatilho — o próprio botão que ela já ia clicar. */
  children: React.ReactNode;
}) {
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger asChild>{children}</AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <AlertDialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2',
            'rounded-lg border bg-card p-5 shadow-lg',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          )}
        >
          <div className="flex gap-3">
            {perigo && (
              <TriangleAlert className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
            )}
            <div className="min-w-0 space-y-1.5">
              <AlertDialog.Title className="font-semibold leading-tight">{titulo}</AlertDialog.Title>
              <AlertDialog.Description asChild>
                <div className="text-sm text-muted-foreground">{descricao}</div>
              </AlertDialog.Description>
            </div>
          </div>

          {/* Cancelar primeiro na ordem de foco e à esquerda: o dedo que vem
              rolando a tela encontra a saída antes da porta sem volta. */}
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialog.Cancel asChild>
              <Button variant="outline" size="sm">
                {rotuloCancelar}
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button
                size="sm"
                variant={perigo ? 'destructive' : 'default'}
                loading={carregando}
                onClick={onConfirmar}
              >
                {rotuloAcao}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
