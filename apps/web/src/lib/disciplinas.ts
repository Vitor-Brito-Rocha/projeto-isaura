/**
 * Sugestão de disciplina a partir do que ela já cadastrou.
 *
 * O problema real: "Matemática" e "Matematica" são a mesma disciplina para ela
 * e duas para o sistema — e a segunda só aparece meses depois, quando o
 * histórico está partido em dois. Sugerir o nome que já existe conserta isso na
 * hora da digitação, que é o único momento barato.
 *
 * Sem `<datalist>` de propósito: o casamento nativo é por prefixo no Safari e
 * não ignora acento em lugar nenhum, então "matematica" não acharia
 * "Matemática" — exatamente o caso que a sugestão existe para cobrir.
 */

/** Sem acento, sem caixa, sem espaço nas pontas. */
export function chaveDisciplina(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

export function sugerirDisciplinas(todas: string[], digitado: string, limite = 5): string[] {
  const alvo = chaveDisciplina(digitado);

  // Campo em branco: mostra o que ela tem, que é um toque em vez de digitar o
  // nome inteiro. É o caso mais comum — onze cadeiras, poucas disciplinas.
  if (!alvo) return todas.slice(0, limite);

  const exato = digitado.trim();

  const candidatos = todas
    .map((nome) => ({ nome, chave: chaveDisciplina(nome) }))
    // Fora só o que ela já digitou LETRA POR LETRA. Comparar pela chave
    // normalizada engoliria justamente o caso que esta função existe para
    // resolver: ela digita "quimica" e a sugestão precisa oferecer "Química",
    // senão nasce a segunda disciplina sem acento.
    .filter((c) => c.nome !== exato && c.chave.includes(alvo));

  // Começar com o que ela digitou vem primeiro: "mat" deve oferecer "Matemática"
  // antes de "Gramática", mesmo que as duas contenham "mat".
  const comeca = candidatos.filter((c) => c.chave.startsWith(alvo));
  const contem = candidatos.filter((c) => !c.chave.startsWith(alvo));

  return [...comeca, ...contem].slice(0, limite).map((c) => c.nome);
}
