'use client';

import { Label } from '@/components/ui/label';
import { PERIODOS, periodoLetivo, semestreDoCampo } from '@/lib/periodo';

/**
 * Ano inteiro ou semestre — usado pela cadeira e pelo plano.
 *
 * Fica ao lado do ano em vez de substituí-lo: na faculdade a disciplina é
 * dividida por semestre e 2026.1 não é 2026.2, mas na escola básica o ano é a
 * unidade e não existe resposta certa para "qual semestre?". O padrão é ano
 * inteiro, então quem não precisa disso nunca decide nada.
 *
 * Mostra embaixo como vai ficar escrito: "2026.1" é a convenção do diário e do
 * sistema da faculdade, e vê-la antes de salvar evita a dúvida de qual metade do
 * ano o número representa.
 */
export function CampoPeriodo({
  id = 'periodo',
  valor,
  onChange,
  ano,
}: {
  id?: string;
  valor: string;
  onChange: (v: string) => void;
  ano: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Período</Label>
      {/* Select nativo, como o de plano de curso: no celular abre a roleta do
          SO, mais rápida de acertar com o polegar. */}
      <select
        id={id}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="flex h-11 w-full rounded-md border border-input bg-card px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm"
      >
        {PERIODOS.map((p) => (
          <option key={p.valor} value={p.valor}>
            {p.rotulo}
          </option>
        ))}
      </select>
      <p className="text-xs text-muted-foreground">
        Vai aparecer como{' '}
        <strong className="font-medium text-foreground">
          {periodoLetivo(ano, semestreDoCampo(valor))}
        </strong>
        .
      </p>
    </div>
  );
}
