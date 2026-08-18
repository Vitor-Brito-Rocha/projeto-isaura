'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Check, Plug, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  avisoDeBase,
  avisoDeSessaoCruzada,
  BASE_PADRAO,
  baseDaApi,
  definirBaseDaApi,
  PODE_ALTERNAR,
  validarBase,
} from '@/lib/base-api';
import { detectarCapacidade } from '@/lib/capacidade';

/**
 * O comportamento da troca, num lugar só.
 *
 * Duas telas mostram isto — o login e os ajustes — e elas precisam de aparências
 * diferentes: no login é um detalhe discreto embaixo do formulário, nos ajustes é
 * um cartão com espaço para explicar. O que NÃO pode divergir é o que acontece ao
 * aplicar, então o markup é livre e a conduta mora aqui.
 */
export function useTrocaDeApi() {
  const qc = useQueryClient();
  const [atual, setAtual] = useState(BASE_PADRAO);
  const [campo, setCampo] = useState('');

  // Só no cliente: `baseDaApi` lê localStorage, que não existe no SSR.
  useEffect(() => {
    const base = baseDaApi();
    setAtual(base);
    setCampo(base);
  }, []);

  const [ehIOS, setEhIOS] = useState(false);
  useEffect(() => {
    const c = detectarCapacidade();
    setEhIOS(c === 'IOS_PWA' || c === 'IOS_NAVEGADOR');
  }, []);

  const mudou = campo !== atual;
  const erro = mudou ? validarBase(campo) : null;
  const aviso = mudou ? avisoDeBase(campo) : null;

  /**
   * Vale para o que ESTÁ em uso, não só para o que está sendo digitado: quem
   * chega no login já deslogado precisa ler o motivo, e nesse momento ninguém
   * digitou nada ainda.
   */
  const avisoDaSessao =
    typeof window === 'undefined'
      ? null
      : avisoDeSessaoCruzada(mudou && !erro ? campo : atual, window.location.origin, ehIOS);

  function aplicar(destino: string | null) {
    definirBaseDaApi(destino);
    const base = baseDaApi();
    setAtual(base);
    setCampo(base);

    /**
     * Limpar o cache não é zelo — é correção.
     *
     * O React Query guarda por chave de consulta, não por servidor. Sem isto, a
     * agenda do ambiente antigo continuaria na tela depois da troca, e a
     * conferência entre ambientes compararia dado velho com dado novo.
     */
    qc.clear();

    toast.success(`Agora falando com ${base}`, {
      description: 'A sessão é por endereço — talvez precise entrar de novo.',
      duration: 7000,
    });
  }

  return {
    atual,
    campo,
    setCampo,
    erro,
    aviso,
    mudou,
    alternada: atual !== BASE_PADRAO,
    avisoDaSessao,
    aplicar,
  };
}

/**
 * A troca no login — e ela precisa existir aqui, não só nos ajustes.
 *
 * Os ajustes ficam atrás do login. Se o app não alcança a API, ela não entra; se
 * não entra, não chega na tela que conserta o endereço. O primeiro desenho tinha
 * exatamente esse laço, e num aparelho de teste ele é intransponível.
 *
 * Vem fechada por padrão: quem abre o login quer entrar, não configurar.
 */
export function TrocarApiCompacto() {
  const t = useTrocaDeApi();
  const [aberto, setAberto] = useState(false);

  if (!PODE_ALTERNAR) return null;

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="mx-auto flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-4 hover:underline"
      >
        <Plug className="size-3.5" aria-hidden />
        API: <span className={t.alternada ? 'font-medium text-alarme' : 'font-medium'}>{t.atual}</span>
        <span aria-hidden>·</span> trocar
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-dashed p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium">Endereço da API</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-mr-1 h-6 px-1.5"
          onClick={() => setAberto(false)}
          aria-label="Fechar"
        >
          <X className="size-3.5" />
        </Button>
      </div>

      <Input
        value={t.campo}
        onChange={(e) => t.setCampo(e.target.value)}
        placeholder="http://localhost:3333/api"
        autoComplete="off"
        spellCheck={false}
        inputMode="url"
        className="h-9 text-sm"
      />

      {t.erro && <p className="text-xs text-destructive">{t.erro}</p>}
      {!t.erro && t.aviso && <p className="text-xs text-muted-foreground">{t.aviso}</p>}
      {t.avisoDaSessao && <p className="text-xs font-medium text-alarme">{t.avisoDaSessao}</p>}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          className="h-8"
          disabled={Boolean(t.erro) || !t.mudou}
          onClick={() => t.aplicar(t.campo)}
        >
          <Check className="size-3.5" />
          Usar este
        </Button>
        {t.alternada && (
          <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => t.aplicar(null)}>
            Voltar ao padrão
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Padrão deste build: <strong className="text-foreground">{BASE_PADRAO}</strong>
      </p>
    </div>
  );
}
