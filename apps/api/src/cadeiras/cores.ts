/**
 * As cores das cadeiras.
 *
 * Cor é a identidade da turma em toda a interface — a barra lateral do cartão,
 * o ponto no calendário, a bolinha na lista de pendências. Com onze cadeiras,
 * é o que ela usa para achar a turma antes de ler o nome.
 *
 * O `@default` do schema dava a MESMA cor para todas: no calendário, onze
 * pontos azuis idênticos não identificam nada. Por isso a cor é escolhida na
 * criação, e não deixada no default.
 *
 * A paleta é escura o bastante para contrastar com fundo claro e clara o
 * bastante para contrastar com fundo escuro — os pontos aparecem nos dois
 * temas sem precisar de duas paletas.
 */
export const PALETA = [
  '#2F4A9C', // azul
  '#1F6F5C', // verde-mar
  '#8A3B7A', // vinho
  '#B25A1F', // laranja queimado
  '#4A6B23', // oliva
  '#7A3B3B', // telha
  '#3D5A80', // azul-aço
  '#6B4E9C', // roxo
  '#A6472E', // terracota
  '#2E6B6B', // petróleo
] as const;

/**
 * A próxima cor livre.
 *
 * Escolhe a primeira que ela ainda não usa; esgotada a paleta, recomeça pela
 * menos usada. Repetir cor é bem melhor que dar erro ou pedir que ela escolha —
 * a décima primeira cadeira tem de nascer sem uma pergunta a mais.
 */
export function proximaCor(usadas: string[]): string {
  const contagem = new Map<string, number>(PALETA.map((c) => [c, 0]));
  for (const cor of usadas) {
    const chave = cor?.toUpperCase();
    for (const c of PALETA) {
      if (c.toUpperCase() === chave) contagem.set(c, (contagem.get(c) ?? 0) + 1);
    }
  }

  let escolhida: string = PALETA[0];
  let menor = Infinity;
  for (const c of PALETA) {
    const n = contagem.get(c) ?? 0;
    // `<` e não `<=`: empate fica com a primeira da paleta, então a ordem de
    // criação é estável e previsível.
    if (n < menor) {
      menor = n;
      escolhida = c;
    }
  }
  return escolhida;
}
