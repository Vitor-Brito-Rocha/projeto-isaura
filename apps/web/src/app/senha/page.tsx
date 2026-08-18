'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiFetch } from '@/lib/api';

/**
 * A tela que o link do email abre.
 *
 * Rota estática com parâmetro de busca, e não `/senha/[codigo]`, pela mesma
 * razão de `/aula?ocorrencia=`: o build do wrapper Android é `output: 'export'`
 * e exigiria enumerar os parâmetros de toda rota dinâmica. Código de uso único
 * não se enumera.
 *
 * O parâmetro se chama `codigo` porque é o que ele é — o `token_hash` do
 * Supabase, que a API troca por sessão. Ele não é a senha nem o token de
 * acesso, e nunca sai daqui a não ser para o nosso próprio servidor.
 */
export default function NovaSenha() {
  return (
    <Suspense fallback={<Casca titulo="Nova senha" />}>
      <Formulario />
    </Suspense>
  );
}

function Casca({ titulo, children }: { titulo: string; children?: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-8 px-6 py-10">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
      </header>
      {children}
    </main>
  );
}

function Formulario() {
  const router = useRouter();
  const codigo = useSearchParams().get('codigo') ?? '';

  const [senha, setSenha] = useState('');
  const [repetida, setRepetida] = useState('');
  const [enviando, setEnviando] = useState(false);

  // Link sem código é link truncado pelo cliente de email, ou endereço digitado
  // à mão. Dizer isso é melhor que um formulário que só falha ao enviar.
  if (!codigo) {
    return (
      <Casca titulo="Link incompleto">
        <p className="text-sm text-muted-foreground">
          Este endereço não traz o código do email. Abra o link do email inteiro, ou peça outro.
        </p>
        <Button asChild className="w-full">
          <Link href="/recuperar">Pedir outro link</Link>
        </Button>
      </Casca>
    );
  }

  const naoConfere = repetida.length > 0 && senha !== repetida;

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (naoConfere) return;
    setEnviando(true);
    try {
      await apiFetch('/auth/senha', { method: 'POST', body: JSON.stringify({ codigo, senha }) });
      // Já entra: ela provou o email e digitou a senha duas vezes. Pedir login
      // agora seria um passo que só existe para ser esquecido.
      toast.success('Senha trocada. Você já está dentro.');
      router.replace('/');
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : 'Não foi possível trocar a senha.', {
        duration: 8000,
      });
      setEnviando(false);
    }
  }

  return (
    <Casca titulo="Criar uma senha nova">
      <form onSubmit={salvar} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="senha">Nova senha</Label>
          <Input
            id="senha"
            type="password"
            required
            autoFocus
            minLength={8}
            autoComplete="new-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Mínimo de 8 caracteres.</p>
        </div>

        {/*
          Repetir não é burocracia: a senha vai digitada às cegas, quase sempre
          no celular, e um erro de digitação aqui tranca a conta atrás de outro
          email de recuperação.
        */}
        <div className="space-y-1.5">
          <Label htmlFor="repetida">Repita a senha</Label>
          <Input
            id="repetida"
            type="password"
            required
            autoComplete="new-password"
            aria-invalid={naoConfere || undefined}
            value={repetida}
            onChange={(e) => setRepetida(e.target.value)}
          />
          {naoConfere && <p className="text-xs text-destructive">As duas senhas estão diferentes.</p>}
        </div>

        <Button type="submit" className="w-full" loading={enviando} disabled={naoConfere}>
          Salvar e entrar
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        O link expirou?{' '}
        <Link
          href="/recuperar"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Peça outro
        </Link>
      </p>
    </Casca>
  );
}
