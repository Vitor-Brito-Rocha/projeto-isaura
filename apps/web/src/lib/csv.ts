import { dataBR } from './datas';
import { entregarArquivo, type DesfechoDaEntrega } from './entrega';
import type { LinhaDoHistorico, Ocorrencia } from './types';

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

const COLUNAS_PENDENCIA = ['Data', 'Início', 'Fim', 'Disciplina', 'Turma', 'Estava planejado'] as const;

/**
 * O que ficou sem registro.
 *
 * Colunas de propósito diferentes das do histórico: aqui não há conteúdo dado —
 * é justamente a ausência dele que põe a linha na lista. O que ajuda é a data,
 * a turma e o que ela tinha planejado, que é a deixa para lembrar da aula.
 *
 * **Este arquivo é ferramenta dela, não peça para a coordenação.** Uma lista
 * das aulas que ela não registrou, entregue a quem a avalia, é documento contra
 * ela mesma. A tela separa os dois botões por isso.
 */
export function pendenciasParaCsv(ocorrencias: Ocorrencia[]): string {
  const corpo = ocorrencias.map((o) =>
    [
      dataBR(o.data),
      o.horaInicio,
      o.horaFim,
      o.cadeira.disciplina,
      o.cadeira.turma,
      o.registro?.planoPrevisto ?? '',
    ]
      .map(campoCsv)
      .join(','),
  );

  return [COLUNAS_PENDENCIA.join(','), ...corpo].join('\r\n');
}

/**
 * O BOM não é enfeite: sem ele o Excel no Windows lê o arquivo como ANSI e
 * "Matemática" vira "MatemÃ¡tica". É o bug mais reportado de exportação em
 * português, e custa três bytes.
 *
 * Fica aqui, e não em `entrega.ts`, porque é problema de CSV e não de como o
 * arquivo sai do aparelho — `entregarArquivo` não deve saber o que é BOM.
 */
export function comBom(csv: string): string {
  return `﻿${csv}`;
}

/** O CSV saindo pelo gesto que este aparelho faz de verdade. Ver `lib/entrega.ts`. */
export function entregarCsv(nome: string, csv: string): Promise<DesfechoDaEntrega> {
  return entregarArquivo(nome, comBom(csv));
}
