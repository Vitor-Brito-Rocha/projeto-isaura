'use client';

import { CircleAlert, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api';

/**
 * O destino do link de confirmação de cadastro.
 *
 * Antes o link do email caía na raiz do site com os tokens no fragmento da URL,
 * que nenhuma tela lia: ela confirmava, via o login e concluía que não tinha
 * funcionado. Aqui o código vira sessão e ela entra direto.
 */
export default function Confirmar() {
  return (
    <Suspense fallback={<Aguardando />}>
      <Troca />
    </Suspense>
  );
}

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      {children}
    </main>
  );
}

function Aguardando() {
  return (
    <Moldura>
      <Loader2 className="size-8 animate-spin text-muted-foreground" aria-hidden />
      <p className="font-medium">Confirmando seu email…</p>
    </Moldura>
  );
}

function Troca() {
  const router = useRouter();
  const codigo = useSearchParams().get('codigo') ?? '';
  const [falha, setFalha] = useState<string | null>(codigo ? null : 'Este link veio incompleto.');
  // O efeito do React roda duas vezes em desenvolvimento, e o código é de uso
  // único: a segunda chamada falharia e apagaria o sucesso da primeira.
  const jaTentou = useRef(false);

  useEffect(() => {
    if (!codigo || jaTentou.current) return;
    jaTentou.current = true;

    apiFetch('/auth/confirmar', { method: 'POST', body: JSON.stringify({ codigo }) })
      .then(() => {
        toast.success('Email confirmado. Bem-vinda!');
        router.replace('/');
      })
      .catch((erro) =>
        setFalha(erro instanceof Error ? erro.message : 'Não foi possível confirmar.'),
      );
  }, [codigo, router]);

  if (!falha) return <Aguardando />;

  return (
    <Moldura>
      <CircleAlert className="size-8 text-alarme" aria-hidden />
      <p className="font-medium">{falha}</p>
      <p className="text-sm text-muted-foreground">
        Links de confirmação valem uma vez só e por pouco tempo. Se você já confirmou antes, é só
        entrar.
      </p>
      <Button asChild className="w-full">
        <Link href="/login">Ir para a entrada</Link>
      </Button>
    </Moldura>
  );
}
