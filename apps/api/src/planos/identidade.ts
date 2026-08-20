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

/** O teto de `CreateCadeiraDto.turma`, repetido para cortar antes de validar. */
const MAX_TURMA = 60;

/**
 * A turma, tirada do `Código/Turma` do documento.
 *
 * `T203 - 30(31)` → `30(31)`. O que vem antes do traço é o código da
 * disciplina, que já está no nome; o que vem depois identifica o grupo, e é o
 * que ela reconhece do próprio documento.
 *
 * **`30(31)` inteiro, e não só `30`.** Os dois números são a mesma turma
 * encontrando duas vezes por semana (ver `ia/unifor-horarios.ts`), e guardar
 * metade jogaria fora justamente a informação que impede alguém de cadastrar as
 * duas separadas depois — o erro que parte o progresso ao meio e duplica o
 * alarme.
 *
 * Sem traço, o código inteiro serve: é melhor um rótulo estranho que ela
 * corrige na tela do que um campo vazio que o `@MinLength(1)` recusa.
 */
export function turmaDoCodigo(codigoTurma: string | null | undefined): string | null {
  if (!codigoTurma) return null;

  const depoisDoTraco = /[-–—]\s*(.+)$/.exec(codigoTurma);
  const turma = (depoisDoTraco?.[1] ?? codigoTurma).replace(/\s+/g, ' ').trim();

  return turma ? turma.slice(0, MAX_TURMA) : null;
}

export interface CadeiraSugerida {
  disciplina: string;
  turma: string;
  anoLetivo: number;
  semestre?: number;
}

/**
 * A turma que o documento descreve, pronta para virar `Cadeira`.
 *
 * Existe porque sem cadeira não há aula: `Ocorrencia.cadeiraId` é obrigatório,
 * e para quem está começando o select de turmas vinha vazio — ela importava o
 * plano inteiro e não conseguia criar uma única aula, que é o que faz o alarme
 * tocar.
 *
 * `null` quando o documento não diz disciplina: aí não há o que propor, e
 * inventar um nome de turma seria pior do que pedir. A tela cai no select das
 * turmas que ela já tem.
 */
export function cadeiraDoDocumento(proposta: PropostaDeImportacao): CadeiraSugerida | null {
  const id = proposta.identificacao;
  if (!id?.disciplina) return null;

  const turma = turmaDoCodigo(id.codigoTurma);
  if (!turma) return null;

  return {
    disciplina: id.disciplina.slice(0, 120),
    turma,
    anoLetivo: id.ano ?? new Date().getUTCFullYear(),
    ...(id.semestre && { semestre: id.semestre }),
  };
}
