import { cn } from '@/lib/utils';

/**
 * Placeholder de carregamento.
 *
 * Preferido a "Carregando…" porque mostra a FORMA do que vem: a tela não salta
 * quando o conteúdo chega, e a pessoa já entende o que esperar. Em conexão de
 * escola, que é o cenário real, isso aparece bastante.
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-muted', className)}
      aria-hidden
      {...props}
    />
  );
}

export { Skeleton };
