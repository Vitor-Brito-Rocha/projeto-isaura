/**
 * Texto de um PDF, para o plano de curso escrito dela virar unidades.
 *
 * PDF é o formato padrão do documento (decisão do usuário, 16/08/2026), e ele
 * abre o caminho barato: extrair a camada de texto aqui e mandar só texto para o
 * modelo. Nenhuma visão, nenhuma troca de provedor — `openai/gpt-oss-120b` pela
 * Groq resolve, de graça.
 *
 * O que este arquivo protege é a fronteira entre "PDF digital" e "PDF que é foto
 * de papel". Os dois têm a mesma extensão e a mesma cara na tela; só o primeiro
 * tem texto. Mandar a camada vazia do segundo para o modelo produziria unidades
 * inventadas a partir do nada — o pior desfecho possível, porque um plano errado
 * contamina todo registro que apontar para ele.
 */

/**
 * Abaixo disto por página, o PDF é imagem.
 *
 * Um plano de curso digital tem centenas de caracteres por página. Um escaneado
 * tem zero, ou um punhado vindo de carimbo e número de página. Quarenta é folga
 * larga para os dois lados: nenhum documento de verdade fica abaixo, e nenhum
 * escaneado chega perto.
 */
export const MINIMO_POR_PAGINA = 40;

/**
 * Teto do que vai para o modelo.
 *
 * Dimensionado pelo limite do plano gratuito da Groq, não por gosto: são 8000
 * tokens por minuto, e em português um token sai por volta de 3,5 caracteres.
 * 16 mil caracteres dão ~4,5 mil tokens, que deixam folga para o prompt de
 * sistema e para a resposta dentro da mesma janela.
 *
 * **Medido, não estimado:** a primeira versão tinha 40 mil e a verificação
 * levou 429 na cara — "Limit 8000, Used 5142, Requested 6361". Um plano de
 * curso de verdade tem uma a três páginas e cabe com sobra; o teto existe para
 * o dia em que ela anexar o regimento da escola por engano.
 */
export const MAX_CARACTERES = 16_000;

export interface TextoDoPdf {
  /** Cortado em `MAX_CARACTERES` — é o que vai para o modelo. */
  texto: string;
  /**
   * O texto inteiro, sem teto.
   *
   * O corte existe pelo limite de tokens por minuto da Groq, e o parser da
   * Unifor não chama a Groq — cortá-lo para ele seria perder data de aula por
   * causa de um limite de outra coisa. E a perda é muda: a grade nasceria curta
   * e ela só descobriria no dia em que a aula não aparecesse.
   */
  textoCompleto: string;
  paginas: number;
  /** true = é foto de papel; não há o que extrair. */
  pareceEscaneado: boolean;
}

/**
 * PDF traz quebra de linha a cada linha desenhada e espaço de sobra do layout
 * em colunas. Sem limpar, metade dos tokens da chamada é espaço em branco.
 */
export function limparTexto(bruto: string): string {
  return bruto
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/[ \t ]+/g, ' ').trim())
    .join('\n')
    // Linha em branco separa seção e isso é sinal útil para o modelo; três ou
    // mais viram duas, que preservam a separação sem o desperdício.
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function pareceEscaneado(texto: string, paginas: number): boolean {
  if (paginas <= 0) return true;
  return texto.length / paginas < MINIMO_POR_PAGINA;
}

/**
 * Extrai o texto. Só é chamado com um Buffer que já passou pelo teto de 10 MB
 * do upload, que é a primeira barreira contra PDF construído para travar o
 * processo.
 */
export async function extrairTextoDePdf(arquivo: Buffer): Promise<TextoDoPdf> {
  // `require` e não `import`: pdf-parse é CommonJS e a API compila para
  // CommonJS. Dentro da função para o custo de carregar o parser só existir
  // quando alguém importa um plano — o resto do app nunca toca nele.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pdfParse = require('pdf-parse') as (b: Buffer) => Promise<{ text: string; numpages: number }>;

  const lido = await pdfParse(arquivo);
  const texto = limparTexto(lido.text ?? '');
  const paginas = lido.numpages ?? 0;

  return {
    texto: texto.slice(0, MAX_CARACTERES),
    textoCompleto: texto,
    paginas,
    pareceEscaneado: pareceEscaneado(texto, paginas),
  };
}
