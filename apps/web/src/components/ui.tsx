'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function Botao({
  variante = 'primario',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: 'primario' | 'secundario' | 'perigo';
}) {
  return (
    <button
      {...props}
      className={clsx(
        'rounded-lg px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed',
        variante === 'primario' && 'bg-registro text-white hover:brightness-110',
        variante === 'secundario' && 'border border-slate-300 bg-white hover:bg-slate-50',
        variante === 'perigo' && 'border border-red-300 text-red-700 hover:bg-red-50',
        className,
      )}
    />
  );
}

export function Campo({
  label,
  dica,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; dica?: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <input
        {...props}
        className={clsx(
          'rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm',
          'focus:border-registro focus:outline-none focus:ring-2 focus:ring-registro/20',
          className,
        )}
      />
      {dica && <span className="text-xs text-slate-500">{dica}</span>}
    </label>
  );
}

export function Selecao<T extends string>({
  label,
  opcoes,
  dica,
  ...props
}: Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'children'> & {
  label: string;
  dica?: string;
  opcoes: ReadonlyArray<{ valor: T; rotulo: string }>;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <select
        {...props}
        className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-registro focus:outline-none focus:ring-2 focus:ring-registro/20"
      >
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))}
      </select>
      {dica && <span className="text-xs text-slate-500">{dica}</span>}
    </label>
  );
}

export function Cartao({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={clsx('rounded-xl border border-slate-200 bg-white p-4', className)}>
      {children}
    </div>
  );
}

/**
 * Aviso de degradação de alarme.
 *
 * Tom âmbar e não vermelho de propósito: não é erro, é o sistema sendo honesto
 * sobre o que este aparelho entrega. Vermelho faria a professora achar que algo
 * quebrou e procurar conserto onde não há.
 */
export function AvisoAlarme({ texto }: { texto: string }) {
  return (
    <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
      {texto}
    </p>
  );
}

export function Navegacao() {
  const caminho = usePathname();
  const itens = [
    { href: '/', rotulo: 'Semana' },
    { href: '/cadeiras', rotulo: 'Cadeiras' },
    { href: '/config', rotulo: 'Ajustes' },
  ];

  return (
    <nav className="safe-bottom sticky bottom-0 border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-3xl">
        {itens.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            className={clsx(
              'flex-1 py-3.5 text-center text-sm font-medium',
              caminho === i.href ? 'text-registro' : 'text-slate-500',
            )}
          >
            {i.rotulo}
          </Link>
        ))}
      </div>
    </nav>
  );
}

export function Cabecalho({ titulo, acao }: { titulo: string; acao?: React.ReactNode }) {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-4">
      <h1 className="text-lg font-bold tracking-tight">{titulo}</h1>
      {acao}
    </header>
  );
}
