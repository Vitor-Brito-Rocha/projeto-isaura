'use client';

import { MailCheck } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiFetch } from '@/lib/api';

/**
 * "Esqueci a senha", primeiro passo.
 *
 * A confirmação é deliberadamente vaga — "se existir conta com esse email" —, e
 * é a mesma resposta para email cadastrado e não cadastrado. A API responde
 * igual nos dois casos; dizer "não encontramos essa conta" transformaria esta
 * tela num verificador de quem usa o sistema, e basta ela ser professora para
 * isso já ser informação sobre uma pessoa.
 */
export default function Recuperar() {
  const [email, setEmail] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  async function pedir(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    try {
      await apiFetch('/auth/recuperar', { method: 'POST', body: JSON.stringify({ email }) });
      setEnviado(true);
    } catch (erro) {
      // Só chega aqui se a própria API falhou (rede, 500). "Email não existe"
      // não é erro: volta 200 como qualquer outro.
      toast.error(erro instanceof Error ? erro.message : 'Não foi possível enviar.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-8 px-6 py-10">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Esqueci minha senha</h1>
        <p className="text-sm text-muted-foreground">
          Digite seu email e mandamos um link para você criar outra.
        </p>
      </header>

      {enviado ? (
        <div className="space-y-3 rounded-lg border border-dashed px-4 py-6 text-center">
          <MailCheck className="mx-auto size-8 text-sucesso" aria-hidden />
          <p className="font-medium">Se existir conta com esse email, o link já saiu</p>
          <p className="text-sm text-muted-foreground">
            Ele vale por pouco tempo e serve uma vez só. Não achou? Confira o spam — e o email pode
            demorar um minuto.
          </p>
          <Button variant="outline" className="w-full" onClick={() => setEnviado(false)}>
            Usar outro email
          </Button>
        </div>
      ) : (
        <form onSubmit={pedir} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              autoFocus
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" loading={enviando}>
            Enviar o link
          </Button>
        </form>
      )}

      <p className="text-center text-sm text-muted-foreground">
        Lembrou?{' '}
        <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
          Entrar
        </Link>
      </p>
    </main>
  );
}
