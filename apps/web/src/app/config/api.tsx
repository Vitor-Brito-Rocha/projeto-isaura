'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Check, Info, Plug } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  avisoDeBase,
  BASE_PADRAO,
  baseDaApi,
  definirBaseDaApi,
  PODE_ALTERNAR,
  validarBase,
} from '@/lib/base-api';

/**
 * Trocar para qual API o app fala, sem build novo.
 *
 * Existe para desenvolvimento: com um build só dá para conferir a mesma tela
 * contra a API local e contra a da VPS. No APK vale ainda mais, porque cada
 * ambiente viraria um arquivo diferente para instalar no aparelho.
 *
 * Só aparece com `NEXT_PUBLIC_API_ALTERNAVEL=1` no build. O build que for para
 * uso de verdade não leva esta tela — endereço de API que se troca é endereço
 * que pode ser trocado para o lugar errado.
 */
export function AlternarApi() {
  const qc = useQueryClient();
  const [atual, setAtual] = useState(BASE_PADRAO);
  const [campo, setCampo] = useState('');

  // Só no cliente: `baseDaApi` lê localStorage, que não existe no SSR.
  useEffect(() => {
    const base = baseDaApi();
    setAtual(base);
    setCampo(base);
  }, []);

  if (!PODE_ALTERNAR) return null;

  const erro = campo === atual ? null : validarBase(campo);
  const aviso = campo === atual ? null : avisoDeBase(campo);
  const alternada = atual !== BASE_PADRAO;

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

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base">Endereço da API</CardTitle>
          {alternada && <Badge variant="alarme">alternado</Badge>}
        </div>
        <CardDescription>
          Para testar a mesma tela contra ambientes diferentes sem gerar outro build.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="base-api">Endereço</Label>
          <Input
            id="base-api"
            value={campo}
            onChange={(e) => setCampo(e.target.value)}
            placeholder="http://localhost:3333/api"
            autoComplete="off"
            spellCheck={false}
            inputMode="url"
          />
          <p className="text-xs text-muted-foreground">
            Em uso: <strong className="text-foreground">{atual}</strong>
            {alternada && ` · padrão deste build: ${BASE_PADRAO}`}
          </p>
          {erro && <p className="text-xs text-destructive">{erro}</p>}
          {!erro && aviso && <p className="text-xs text-muted-foreground">{aviso}</p>}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={Boolean(erro) || campo === atual} onClick={() => aplicar(campo)}>
            <Check />
            Usar este
          </Button>
          {alternada && (
            <Button size="sm" variant="outline" onClick={() => aplicar(null)}>
              <Plug />
              Voltar ao padrão
            </Button>
          )}
        </div>

        {/*
          O aviso é sobre o que confunde de verdade na hora de testar: o cookie
          de sessão é por endereço, então trocar de API parece um logout. E,
          entre sites diferentes, `SameSite=Lax` nem manda o cookie — que é
          exatamente o problema da frente C da fase 6, chegando mais cedo.
        */}
        <Alert>
          <Info aria-hidden />
          <AlertDescription>
            A sessão vive num cookie por endereço: ao trocar, você provavelmente vai precisar entrar
            de novo, e ao voltar a sessão antiga reaparece. Apontar o navegador para uma API em
            outro site (não só outra porta) não persiste o login — o cookie é <code>SameSite=Lax</code>.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}
