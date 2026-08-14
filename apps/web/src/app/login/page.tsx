'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { Botao, Campo } from '@/components/ui';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    try {
      await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, senha }),
      });
      router.push('/');
      router.refresh();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : 'Não foi possível entrar.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Projeto Isaura</h1>
        <p className="mt-1 text-sm text-slate-600">
          Suas aulas, com um lembrete na hora certa.
        </p>
      </div>

      <form onSubmit={entrar} className="flex flex-col gap-4">
        <Campo
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Campo
          label="Senha"
          type="password"
          autoComplete="current-password"
          required
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
        />
        <Botao type="submit" disabled={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </Botao>
      </form>

      <p className="text-center text-sm text-slate-600">
        Ainda não tem conta?{' '}
        <Link href="/cadastro" className="font-semibold text-registro">
          Criar conta
        </Link>
      </p>
    </main>
  );
}
