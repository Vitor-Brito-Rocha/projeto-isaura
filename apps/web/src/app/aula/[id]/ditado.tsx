'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { Mic, Square, Wand2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { apiFetch } from '@/lib/api';
import { useDitado } from '@/lib/ditado';
import type { RascunhoIA } from '@/lib/rascunho';

interface Resposta {
  rascunho: RascunhoIA;
  transcricao: string;
}

/**
 * Contar a aula falando, em vez de preencher seis campos.
 *
 * A fala fica visível ao lado do que a IA escreveu, e continua visível até ela
 * salvar: é assim que ela confere se o modelo inventou alguma coisa. O botão de
 * salvar do formulário é que marca a revisão — e é nesse momento que a fala é
 * descartada do servidor.
 */
export function Ditado({
  ocorrenciaId,
  falaSalva,
  temRascunho,
  aoGerar,
}: {
  ocorrenciaId: string;
  falaSalva: string;
  temRascunho: boolean;
  aoGerar: (rascunho: RascunhoIA) => void;
}) {
  const [fala, setFala] = useState('');
  // `temRascunho` vem do servidor e só chega no próximo refetch. Sem isto, o
  // aviso de "ainda é rascunho" apareceria tarde — depois de ela já ter olhado
  // os campos preenchidos e concluído que estavam salvos.
  const [gerouAgora, setGerouAgora] = useState(false);

  useEffect(() => setFala(falaSalva), [falaSalva]);

  const { disponivel, ouvindo, alternar } = useDitado(
    (t) => setFala((atual) => (atual ? `${atual} ${t}` : t)),
    (m) => toast.error(m),
  );

  // Uma pergunta por sessão: é configuração do servidor, não muda no meio.
  const { data: status } = useQuery({
    queryKey: ['ia-status'],
    queryFn: () => apiFetch<{ resumo: boolean }>('/ia/status'),
    staleTime: Infinity,
    retry: false,
  });

  const gerar = useMutation({
    mutationFn: () =>
      apiFetch<Resposta>(`/ia/ocorrencia/${ocorrenciaId}/resumo`, {
        method: 'POST',
        body: JSON.stringify({ transcricao: fala }),
      }),
    onSuccess: (r) => {
      aoGerar(r.rascunho);
      setGerouAgora(true);
      toast.success('Rascunho pronto.', {
        description: 'Confira antes de salvar — ainda não conta como registro.',
        duration: 6000,
      });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : 'Não foi possível gerar o resumo.'),
  });

  // Sem chave configurada no servidor não há o que oferecer. Some inteiro em
  // vez de mostrar um botão que só produz erro.
  if (!status?.resumo) return null;

  const curta = fala.trim().length < 10;

  return (
    <div className="space-y-2 rounded-md border border-dashed bg-muted/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="fala">Conte o que você deu</Label>
        {disponivel && (
          <Button
            type="button"
            size="sm"
            variant={ouvindo ? 'default' : 'outline'}
            className="h-8"
            onClick={alternar}
          >
            {ouvindo ? <Square /> : <Mic />}
            {ouvindo ? 'Parar' : 'Ditar'}
          </Button>
        )}
      </div>

      <Textarea
        id="fala"
        value={fala}
        onChange={(e) => setFala(e.target.value)}
        placeholder="Ex.: continuei o que eu tinha planejado, cheguei até soma de frações e passei a página 42 para sexta"
        rows={4}
      />

      <p className="text-xs text-muted-foreground">
        {disponivel
          ? 'Fale normalmente. O microfone do teclado também escreve aqui.'
          : 'Toque no microfone do teclado do seu celular para falar em vez de digitar.'}
      </p>

      <Button
        type="button"
        variant="secondary"
        className="w-full"
        onClick={() => gerar.mutate()}
        disabled={gerar.isPending || curta || ouvindo}
      >
        <Wand2 /> {gerar.isPending ? 'Organizando…' : 'Preencher com o que eu falei'}
      </Button>

      {(temRascunho || gerouAgora) && (
        <p className="text-xs text-muted-foreground">
          Os campos abaixo estão preenchidos por IA e ainda são rascunho. Salvar é o que transforma
          isso em registro — e apaga esta fala do servidor.
        </p>
      )}
    </div>
  );
}
