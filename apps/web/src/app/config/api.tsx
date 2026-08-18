'use client';

import { Check, Info, Plug } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTrocaDeApi } from '@/components/trocar-api';
import { BASE_PADRAO, PODE_ALTERNAR } from '@/lib/base-api';

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
  const t = useTrocaDeApi();

  if (!PODE_ALTERNAR) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base">Endereço da API</CardTitle>
          {t.alternada && <Badge variant="alarme">alternado</Badge>}
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
            value={t.campo}
            onChange={(e) => t.setCampo(e.target.value)}
            placeholder="http://localhost:3333/api"
            autoComplete="off"
            spellCheck={false}
            inputMode="url"
          />
          <p className="text-xs text-muted-foreground">
            Em uso: <strong className="text-foreground">{t.atual}</strong>
            {t.alternada && ` · padrão deste build: ${BASE_PADRAO}`}
          </p>
          {t.erro && <p className="text-xs text-destructive">{t.erro}</p>}
          {!t.erro && t.aviso && <p className="text-xs text-muted-foreground">{t.aviso}</p>}
          {t.avisoDaSessao && (
            <p className="text-xs font-medium text-alarme">{t.avisoDaSessao}</p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={Boolean(t.erro) || !t.mudou} onClick={() => t.aplicar(t.campo)}>
            <Check />
            Usar este
          </Button>
          {t.alternada && (
            <Button size="sm" variant="outline" onClick={() => t.aplicar(null)}>
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
