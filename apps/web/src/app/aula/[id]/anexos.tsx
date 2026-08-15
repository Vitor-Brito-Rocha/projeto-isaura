'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, ImageIcon, Paperclip, X } from 'lucide-react';
import { useRef } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api';
import type { Anexo } from '@/lib/types';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? '/api';

function tamanho(bytes: number | null) {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

/**
 * Foto do quadro e do material — não dos alunos.
 *
 * O aviso na tela não é decoração: nenhum código impede fotografar um caderno
 * com o nome de um menor na capa, então a decisão fica com ela, informada. Ver
 * "LGPD" em docs/PLANO.md.
 *
 * Diferente do texto, anexo NÃO entra na fila offline: exige rede na hora, e a
 * tela diz isso quando falha em vez de fingir que guardou.
 */
export function Anexos({ ocorrenciaId }: { ocorrenciaId: string }) {
  const qc = useQueryClient();
  const campo = useRef<HTMLInputElement>(null);

  const { data: anexos, isLoading } = useQuery({
    queryKey: ['anexos', ocorrenciaId],
    queryFn: async () => {
      const r = await fetch(`${BASE}/registros/ocorrencia/${ocorrenciaId}/anexos`, {
        credentials: 'include',
      });
      if (!r.ok) throw new ApiError(r.status, 'Não foi possível listar os anexos.');
      return (await r.json()) as Anexo[];
    },
  });

  const enviar = useMutation({
    mutationFn: async (arquivo: File) => {
      // FormData sem Content-Type manual: o navegador precisa gerar o boundary
      // do multipart, e defini-lo à mão quebra o parse no servidor.
      const corpo = new FormData();
      corpo.append('arquivo', arquivo);
      const r = await fetch(`${BASE}/registros/ocorrencia/${ocorrenciaId}/anexos`, {
        method: 'POST',
        credentials: 'include',
        body: corpo,
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new ApiError(r.status, (j as { message?: string }).message ?? 'Falha no envio.');
      }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['anexos', ocorrenciaId] });
      toast.success('Anexo enviado.');
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : 'Não foi possível enviar o anexo.', {
        description: 'Anexo precisa de rede. O texto da aula continua sendo salvo mesmo sem.',
      }),
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`${BASE}/anexos/${id}`, { method: 'DELETE', credentials: 'include' });
      if (!r.ok) throw new ApiError(r.status, 'Não foi possível remover.');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['anexos', ocorrenciaId] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Não foi possível remover.'),
  });

  return (
    <div className="space-y-2">
      <Label>Anexos</Label>

      {!isLoading && (anexos?.length ?? 0) > 0 && (
        <ul className="space-y-1">
          {anexos?.map((a) => (
            <li key={a.id} className="flex items-center gap-2 rounded-md border px-2 py-1.5">
              {a.tipo === 'FOTO' ? (
                <ImageIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              ) : (
                <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              )}
              {a.url ? (
                <a
                  href={a.url}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 flex-1 truncate text-sm underline-offset-2 hover:underline"
                >
                  {a.nomeArquivo}
                </a>
              ) : (
                <span className="min-w-0 flex-1 truncate text-sm">{a.nomeArquivo}</span>
              )}
              <span className="shrink-0 text-xs text-muted-foreground">
                {tamanho(a.tamanhoBytes)}
              </span>
              <Button
                size="icon"
                variant="ghost"
                className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                aria-label={`Remover ${a.nomeArquivo}`}
                onClick={() => remover.mutate(a.id)}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <input
        ref={campo}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
        className="hidden"
        onChange={(e) => {
          const arquivo = e.target.files?.[0];
          if (arquivo) enviar.mutate(arquivo);
          e.target.value = ''; // permite reenviar o mesmo arquivo
        }}
      />

      <Button
        type="button"
        variant="outline"
        size="sm"
        loading={enviar.isPending}
        onClick={() => campo.current?.click()}
      >
        <Paperclip />
        {enviar.isPending ? 'Enviando…' : 'Anexar foto ou PDF'}
      </Button>

      <p className="text-xs text-muted-foreground">
        Fotos do quadro e do material, não dos alunos. Até 10 MB.
      </p>
    </div>
  );
}
