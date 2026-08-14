import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Junta classes resolvendo conflitos do Tailwind.
 *
 * `clsx` sozinho concatenaria "px-4 px-2" e o resultado dependeria da ordem no
 * CSS gerado, não da ordem em que você escreveu. `twMerge` faz a última ganhar,
 * que é o que permite um componente aceitar `className` para sobrescrever o
 * próprio padrão.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
