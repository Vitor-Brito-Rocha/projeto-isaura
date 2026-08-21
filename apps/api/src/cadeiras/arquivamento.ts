/**
 * Quais aulas canceladas voltam quando ela reativa a turma.
 *
 * Reativar não pode devolver tudo que está cancelado. Aula que ELA desmarcou à
 * mão antes de arquivar — feriado escolar, semana de prova, aula trocada com
 * outro professor — foi uma decisão dela, e ressuscitá-la coloca um alarme num
 * dia sem aula. É o pior desfecho que este produto tem: o aviso perde o
 * significado, e alarme demais vira alarme nenhum.
 *
 * **O carimbo que separa as duas é a marca de notificação.** `desativar` cancela
 * em um `updateMany` só, gravando o MESMO instante em todas as linhas que
 * derruba — e nunca encosta em aula já cancelada, porque o `where` dele exige
 * `AGENDADA`. Então o maior desses instantes identifica exatamente a leva do
 * último arquivamento, e tudo com carimbo mais antigo é cancelamento dela.
 *
 * Puro e sem banco de propósito: é a regra que alguém vai querer "simplificar"
 * para "devolve tudo que está cancelado", e o estrago disso não aparece na tela
 * — aparece num alarme, semanas depois, num dia em que ela não tem aula.
 */
export interface Cancelada {
  /** Marca de reivindicação do alarme, gravada no instante do cancelamento. */
  aberturaNotificadaEm: Date | null;
}

export function levaDoArquivamento<T extends Cancelada>(canceladas: T[]): T[] {
  const carimbos = canceladas
    .map((c) => c.aberturaNotificadaEm?.getTime())
    .filter((t): t is number => t !== undefined);

  if (carimbos.length === 0) return [];

  const ultima = Math.max(...carimbos);
  return canceladas.filter((c) => c.aberturaNotificadaEm?.getTime() === ultima);
}
