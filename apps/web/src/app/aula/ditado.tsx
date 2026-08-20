'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { Mic, Square, Wand2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { apiFetch } from '@/lib/api';
import { useDitado } from '@/lib/ditado';
import type { RascunhoIA } from '@/lib/rascunho';
import { useRascunhoLocal } from '@/lib/usar-rascunho-local';
import { RascunhoRecuperado } from './rascunho-recuperado';

interface Resposta {
  rascunho: RascunhoIA;
  transcricao: string;
}

/**
 * Contar a aula falando, em vez de preencher seis campos.
 *
 * A fala fica visível ao lado do que a IA escreveu: é assim que ela confere se
 * o modelo inventou alguma coisa. O botão de salvar do formulário é que marca a
 * revisão — e a fala **continua guardada** depois dela, por decisão do usuário,
 * para ela poder reconferir meses depois. O que não sobrevive é áudio.
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

  // A fala só alcança o servidor pelo botão de gerar o rascunho. Sem guardá-la
  // no aparelho, contar a aula inteira e sair da tela antes de apertar o botão
  // perdia tudo — é o texto mais longo desta tela e o mais caro de refazer.
  //
  // `enviada` é a sombra do que o servidor acabou de guardar: gerar o rascunho
  // grava a fala em `transcricaoBruta`, mas a tela não refaz a consulta ali —
  // é o mesmo motivo de `gerouAgora` existir. Sem esta sombra, o aviso de
  // rascunho continuaria dizendo "isto não saiu do aparelho" sobre uma fala que
  // acabou de sair.
  const [enviada, setEnviada] = useState<string | null>(null);
  const doServidor = useMemo(() => ({ fala: enviada ?? falaSalva }), [enviada, falaSalva]);
  const valores = useMemo(() => ({ fala }), [fala]);
  const { local, recuperado, descartar } = useRascunhoLocal(
    `fala:${ocorrenciaId}`,
    valores,
    doServidor,
  );

  // Dois efeitos, nesta ordem — ver `lib/usar-rascunho-local.ts`.
  useEffect(() => setFala(doServidor.fala), [doServidor]);
  useEffect(() => {
    if (local) setFala(local.fala);
  }, [local]);

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
      setEnviada(r.transcricao);
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
        {/* "Do seu jeito" separa este campo do de baixo antes de ela digitar:
            aqui ela fala solto, ali fica o registro. Sem isso são duas caixas
            de texto iguais e ela precisa descobrir a diferença tentando. */}
        <Label htmlFor="fala">Conte a aula do seu jeito</Label>
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

      {recuperado && (
        <RascunhoRecuperado
          consequencia="Ela ainda não saiu do aparelho: quem a envia é o botão abaixo."
          oQueSomeAoDescartar="O campo volta para a última fala que você enviou nesta aula. O que você ditou e não enviou some do aparelho, e não dá para trazer de volta."
          onDescartar={() => {
            descartar();
            setFala(doServidor.fala);
          }}
        />
      )}

      <Textarea
        id="fala"
        value={fala}
        onChange={(e) => setFala(e.target.value)}
        placeholder="Ex.: continuei o que eu tinha planejado, cheguei até soma de frações e passei a página 42 para sexta"
        rows={4}
      />

      <p className="text-xs text-muted-foreground">
        {disponivel
          ? 'Fale normalmente, sem se preocupar com a forma. O microfone do teclado também escreve aqui.'
          : 'Toque no microfone do teclado do seu celular para falar em vez de digitar.'}{' '}
        Isto aqui não vira registro sozinho — o botão abaixo é que preenche os campos.
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
          isso em registro. Sua fala fica guardada aqui, para você reconferir depois.
        </p>
      )}
    </div>
  );
}
