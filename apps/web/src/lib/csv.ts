import { dataBR } from './datas';
import type { LinhaDoHistorico } from './types';

/**
 * O histórico virando planilha.
 *
 * Existe porque em algum momento a coordenação pede em Excel, e "exportar" que
 * devolve um arquivo que o Excel abre torto não serve para nada.
 *
 * **A fala dela não entra aqui — e isso não é decisão desta função.** O
 * endpoint do histórico nem busca `transcricaoBruta` e `resumoPadronizado` do
 * banco, então não há como um deles vazar para o arquivo por descuido de quem
 * mexer nesta lista depois. Ver `HistoricoService`.
 */

const COLUNAS = [
  'Data',
  'Início',
  'Fim',
  'Disciplina',
  'Turma',
  'Unidade',
  'Tópicos',
  'Planejado',
  'Conteúdo dado',
  'Atividade de casa',
  'Entrega',
  'Plano da próxima',
] as const;

/**
 * Escapa um campo de CSV.
 *
 * Aspas duplicadas e o campo inteiro entre aspas quando há vírgula, aspas ou
 * quebra de linha — e conteúdo de aula tem os três. Sem isso, um "Ex.: frações,
 * exercícios 1 a 8" vira duas colunas e desalinha a planilha inteira.
 */
export function campoCsv(valor: string | null | undefined): string {
  const texto = valor ?? '';
  return /[",\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

export function historicoParaCsv(linhas: LinhaDoHistorico[]): string {
  const corpo = linhas.map((l) =>
    [
      dataBR(l.data),
      l.horaInicio,
      l.horaFim,
      l.cadeira.disciplina,
      l.cadeira.turma,
      l.unidade ?? '',
      l.topicos.join('; '),
      l.planoPrevisto ?? '',
      l.conteudoDado ?? '',
      l.atividadeCasa ?? '',
      l.dataEntrega ? dataBR(l.dataEntrega) : '',
      l.planoProximaAula ?? '',
    ]
      .map(campoCsv)
      .join(','),
  );

  // CRLF: é o que o Excel espera. Com LF puro ele abre, mas o Google Planilhas
  // e o LibreOffice discordam em campo com quebra de linha dentro.
  return [COLUNAS.join(','), ...corpo].join('\r\n');
}

/**
 * O BOM não é enfeite: sem ele o Excel no Windows lê o arquivo como ANSI e
 * "Matemática" vira "MatemÃ¡tica". É o bug mais reportado de exportação em
 * português, e custa três bytes.
 */
export function baixarCsv(nome: string, csv: string): void {
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}
