/**
 * Como o período letivo aparece na tela: "2026.1" ou "2026".
 *
 * A faculdade divide disciplina por semestre — a cadeira de 2026.1 não é a de
 * 2026.2, são turmas e históricos diferentes. A escola básica trabalha o ano
 * inteiro. Os dois convivem: o semestre é opcional, e quem não usa nunca vê a
 * pergunta.
 *
 * "2026.1" e não "1º semestre de 2026" porque é assim que está escrito no
 * diário, no sistema da faculdade e na boca de quem trabalha lá.
 */
export function periodoLetivo(anoLetivo: number, semestre?: number | null): string {
  return semestre ? `${anoLetivo}.${semestre}` : String(anoLetivo);
}

export const PERIODOS = [
  { valor: '', rotulo: 'Ano inteiro' },
  { valor: '1', rotulo: '1º semestre' },
  { valor: '2', rotulo: '2º semestre' },
] as const;

/**
 * O que o `<select>` devolve, virado no que a API recebe.
 *
 * `undefined` e não `null` na criação: o corpo do POST não carrega a chave, e a
 * coluna nasce nula pelo default. Na edição quem limpa é `null` — ver
 * `UpdateCadeiraDto.semestre`.
 */
export function semestreDoCampo(valor: string): number | undefined {
  return valor ? Number(valor) : undefined;
}
