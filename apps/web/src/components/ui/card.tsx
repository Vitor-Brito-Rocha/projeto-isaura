import * as React from 'react';
import { cn } from '@/lib/utils';

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('rounded-lg border bg-card text-card-foreground shadow-sm', className)}
      {...props}
    />
  ),
);
Card.displayName = 'Card';

/**
 * Um respiro só, sem degrau por tamanho de tela — e isso é conserto, não gosto.
 *
 * O padrão era `p-4 pt-0 sm:p-5 sm:pt-0`. O `cn` resolve conflito do Tailwind
 * pelo MODIFICADOR: `py-3` vindo de fora cancela `p-4` e `pt-0`, mas não encosta
 * em `sm:p-5 sm:pt-0`, que são outro modificador. E como classe de media query
 * sai depois no CSS, acima de 640px ela ganhava — todo cartão escrito com
 * `<CardContent className="py-3">` ficava com **zero** de padding em cima e 20
 * embaixo.
 *
 * Medido no navegador, e não deduzido: em 1280px, o cartão de pendências, os
 * cartões de progresso, o filtro do histórico e cada linha do histórico
 * apareciam com o texto encostado na borda de cima. No celular, onde não há
 * `sm:`, os mesmos cartões estavam certos — por isso passou tanto tempo.
 *
 * Manter o degrau exigiria escrever `py-3 sm:py-3` em cada chamada e lembrar
 * disso para sempre; a diferença que ele comprava eram 4px. Sem `sm:` no
 * primitivo, quem passa `className` ganha em qualquer largura, que é o contrato
 * que o `cn` promete.
 */
const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col gap-1 p-4', className)} {...props} />
  ),
);
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn('font-semibold leading-tight tracking-tight', className)} {...props} />
  ),
);
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
  ),
);
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-4 pt-0', className)} {...props} />
  ),
);
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center gap-2 p-4 pt-0', className)} {...props} />
  ),
);
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
