'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { Botao, Campo } from '@/components/ui';

export default function Cadastro() {
  const router = useRouter();
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    try {
      const r = await apiFetch<{ logado: boolean }>('/auth/signup', {
        method: 'POST',
        body: JSON.stringify({ nome, email, senha }),
      });

      if (r.logado) {
        router.push('/');
        router.refresh();
        return;
      }
      // Sem sessão: ou o email já existe, ou o projeto exige confirmação. A API
      // devolve a mesma resposta para os dois de propósito — distinguir aqui
      // transformaria a tela num verificador de quais emails têm conta.
      toast.info('Confira seu email para concluir o cadastro, ou entre se já tiver conta.');
      router.push('/login');
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : 'Não foi possível criar a conta.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Criar conta</h1>
        <p className="mt-1 text-sm text-slate-600">
          Cadastre suas cadeiras uma vez e receba o lembrete em toda aula.
        </p>
      </div>

      <form onSubmit={criar} className="flex flex-col gap-4">
        <Campo
          label="Nome"
          required
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          autoComplete="name"
        />
        <Campo
          label="Email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
        <Campo
          label="Senha"
          type="password"
          required
          minLength={8}
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          autoComplete="new-password"
          dica="Mínimo de 8 caracteres."
        />
        <Botao type="submit" disabled={enviando}>
          {enviando ? 'Criando…' : 'Criar conta'}
        </Botao>
      </form>

      <p className="text-center text-sm text-slate-600">
        Já tem conta?{' '}
        <Link href="/login" className="font-semibold text-registro">
          Entrar
        </Link>
      </p>
    </main>
  );
}
