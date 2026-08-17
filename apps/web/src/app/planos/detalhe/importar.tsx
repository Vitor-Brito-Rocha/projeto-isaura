'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileSearch, Sparkles, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api';
import type { Anexo } from '@/lib/types';

interface UnidadeExtraida {
  titulo: string;
  topicos: string[];
}

/**
 * Lê o PDF do plano de curso e propõe as unidades.
 *
 * **Nada é gravado até ela confirmar.** O rascunho vive só nesta tela: um plano
 * importado com a unidade 3 errada contamina todo registro que apontar para
 * ela, e o erro só aparece meses depois, quando ela for olhar o progresso da
 * turma. Por isso a lista chega com tudo marcado mas desmarcável, e só o botão
 * de confirmar cria alguma coisa.
 *
 * Ela renomeia depois, na própria lista de unidades — que já tem edição no
 * lugar. Corrigir texto aqui seria construir um segundo editor para o mesmo
 * dado.
 */
export function ImportarPlano({ planoId, onImportou }: { planoId: string; onImportou: () => void }) {
  const qc = useQueryClient();
  const [proposta, setProposta] = useState<UnidadeExtraida[] | null>(null);
  const [fora, setFora] = useState<Set<number>>(new Set());

  const { data: ia } = useQuery({
    queryKey: ['ia', 'status'],
    queryFn: () => apiFetch<{ resumo: boolean; provedor: string | null }>('/ia/status'),
    staleTime: Infinity,
  });

  // Mesma chave do componente de anexos: a lista já está em cache.
  const { data: anexos } = useQuery({
    queryKey: ['anexos', 'plano', planoId],
    queryFn: () => apiFetch<Anexo[]>(`/planos/${planoId}/anexos`),
  });

  const extrair = useMutation({
    mutationFn: (anexoId: string) =>
      apiFetch<{ unidades: UnidadeExtraida[]; paginas: number }>(
        `/ia/plano/${planoId}/anexo/${anexoId}/extrair`,
        { method: 'POST' },
      ),
    onSuccess: (r) => {
      setFora(new Set());
      setProposta(r.unidades);
      if (r.unidades.length === 0) {
        toast.warning('Não achei unidades neste documento.', {
          description: 'Ele continua guardado aqui, e as unidades você cadastra na mão.',
        });
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Não foi possível ler o PDF.'),
  });

  const confirmar = useMutation({
    mutationFn: (unidades: UnidadeExtraida[]) =>
      apiFetch(`/planos/${planoId}/unidades/importar`, {
        method: 'POST',
        body: JSON.stringify({ unidades }),
      }),
    onSuccess: (_r, unidades) => {
      setProposta(null);
      qc.invalidateQueries({ queryKey: ['plano', planoId] });
      onImportou();
      toast.success(
        unidades.length === 1 ? '1 unidade criada.' : `${unidades.length} unidades criadas.`,
      );
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Não foi possível criar.'),
  });

  const pdfs = (anexos ?? []).filter((a) => a.nomeArquivo.toLowerCase().endsWith('.pdf'));
  if (!ia?.resumo || pdfs.length === 0) return null;

  const escolhidas = (proposta ?? []).filter((_, i) => !fora.has(i));

  return (
    <div className="space-y-3 border-t pt-3">
      {proposta === null ? (
        <>
          <p className="text-xs text-muted-foreground">
            Dá para ler as unidades direto do PDF. Você confere antes de qualquer coisa ser criada.
          </p>
          <div className="flex flex-wrap gap-2">
            {pdfs.map((a) => (
              <Button
                key={a.id}
                size="sm"
                variant="outline"
                loading={extrair.isPending && extrair.variables === a.id}
                onClick={() => extrair.mutate(a.id)}
              >
                <FileSearch />
                Ler {a.nomeArquivo}
              </Button>
            ))}
          </div>
        </>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <Sparkles className="size-4 text-muted-foreground" aria-hidden />
              {proposta.length === 0
                ? 'Nada encontrado'
                : `${proposta.length} unidade(s) no documento`}
            </p>
            <Button
              size="icon"
              variant="ghost"
              className="size-8"
              aria-label="Descartar proposta"
              onClick={() => setProposta(null)}
            >
              <X className="size-4" />
            </Button>
          </div>

          {proposta.length > 0 && (
            <>
              <p className="text-xs text-muted-foreground">
                Saída de IA — confira antes de criar. Desmarque o que não for unidade; o texto você
                ajusta depois, na lista.
              </p>

              <ul className="space-y-1.5">
                {proposta.map((u, i) => (
                  <li key={i} className="rounded-md border px-3 py-2">
                    <label className="flex cursor-pointer items-start gap-2">
                      <input
                        type="checkbox"
                        className="mt-1 size-4 shrink-0"
                        checked={!fora.has(i)}
                        onChange={() =>
                          setFora((atual) => {
                            const novo = new Set(atual);
                            if (novo.has(i)) novo.delete(i);
                            else novo.add(i);
                            return novo;
                          })
                        }
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{u.titulo}</span>
                        {u.topicos.length > 0 && (
                          <span className="block text-xs text-muted-foreground">
                            {u.topicos.join(' · ')}
                          </span>
                        )}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>

              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  loading={confirmar.isPending}
                  disabled={escolhidas.length === 0}
                  onClick={() => confirmar.mutate(escolhidas)}
                >
                  Criar {escolhidas.length} unidade(s)
                </Button>
                <Button size="sm" variant="outline" onClick={() => setProposta(null)}>
                  Descartar
                </Button>
              </div>

              {/* Acrescenta ao fim, não substitui: o plano pode já ter unidade
                  digitada na mão, e importar não é motivo para apagá-la. */}
              <p className="text-xs text-muted-foreground">
                Entram no fim da lista. O que você já tinha cadastrado fica.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
