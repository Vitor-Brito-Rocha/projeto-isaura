'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TrocarApiCompacto } from '@/components/trocar-api';
import { apiFetch } from '@/lib/api';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    try {
      await apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ email, senha }) });
      router.push('/');
      router.refresh();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : 'Não foi possível entrar.');
      setEnviando(false);
    }
    // Sem `finally`: no sucesso a navegação já começou, e voltar o botão ao
    // normal faria a tela piscar "Entrar" antes de sair.
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-8 px-6 py-10">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Projeto Isaura</h1>
        <p className="text-sm text-muted-foreground">Suas aulas, com um lembrete na hora certa.</p>
      </header>

      <form onSubmit={entrar} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="senha">Senha</Label>
          <Input
            id="senha"
            type="password"
            autoComplete="current-password"
            required
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
          />
        </div>
        <Button type="submit" className="w-full" loading={enviando}>
          Entrar
        </Button>
      </form>

      <TrocarApiCompacto />

      <p className="text-center text-sm text-muted-foreground">
        Ainda não tem conta?{' '}
        <Link href="/cadastro" className="font-medium text-primary underline-offset-4 hover:underline">
          Criar conta
        </Link>
      </p>
    </main>
  );
}
