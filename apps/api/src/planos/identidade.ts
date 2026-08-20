import type { PropostaDeImportacao } from '../ia/importacao.service';

/**
 * O nome e o período do plano, tirados do documento.
 *
 * Os padrões existem porque o documento pode não ser da Unifor — aí o parser
 * não devolve identificação nenhuma, e o plano nasce com o nome do arquivo para
 * ela renomear no detalhe, que já tem edição no lugar. Um formulário antes do
 * upload traria de volta exatamente a digitação que este caminho existe para
 * acabar.
 */
export function identidadeDoPlano(
  proposta: PropostaDeImportacao,
  nomeDoArquivo: string,
): { nome: string; disciplina?: string; anoLetivo: number; semestre?: number } {
  const id = proposta.identificacao;
  const semExtensao = nomeDoArquivo.replace(/\.pdf$/i, '').trim();
  const anoLetivo = id?.ano ?? new Date().getUTCFullYear();

  const periodo = id?.semestre ? `${anoLetivo}.${id.semestre}` : String(anoLetivo);
  const nome = id?.disciplina ? `${id.disciplina} — ${periodo}` : semExtensao || `Plano ${periodo}`;

  return {
    nome: nome.slice(0, 160),
    ...(id?.disciplina && { disciplina: id.disciplina.slice(0, 120) }),
    anoLetivo,
    ...(id?.semestre && { semestre: id.semestre }),
  };
}
