/**
 * Como o arquivo sai do aparelho.
 *
 * Mesma família de `capacidade.ts`: detectar o que o aparelho entrega de
 * verdade e **dizer isso antes**, em vez de prometer e degradar em silêncio.
 *
 * O celular dela é o caso normal, não a exceção — e no celular "baixar" é o
 * gesto errado: o arquivo cai numa pasta que ela não acha. Compartilhar abre a
 * folha do sistema, com WhatsApp e email, que é como ela vai mandar para a
 * coordenação de verdade. `navigator.share({ files })` já funciona no Chrome do
 * Android e no Safari do iOS — não depende do wrapper Capacitor, ele só melhora
 * dentro dele. Ver "Fase 7" em `docs/PLANO.md`.
 */
export type Entrega = 'COMPARTILHAR' | 'BAIXAR';

/**
 * O que o aparelho sabe fazer, já reduzido a duas perguntas.
 *
 * A decisão fica pura para poder ser testada sem `navigator` nem `File` — a
 * sonda de capacidade mora em `detectarEntrega`, que é a parte impura.
 */
export interface CapacidadeDeEntrega {
  /** Existe `navigator.share`. */
  temShare: boolean;
  /** `navigator.canShare({ files })` aceitou um arquivo de amostra. */
  aceitaArquivo: boolean;
}

export function decidirEntrega({ temShare, aceitaArquivo }: CapacidadeDeEntrega): Entrega {
  // Os dois: há navegador com `share` que recusa arquivo e só aceita texto e
  // link. Compartilhar um CSV nesse caso falha DEPOIS do clique, com a folha do
  // sistema já aberta — pior do que nunca ter oferecido.
  return temShare && aceitaArquivo ? 'COMPARTILHAR' : 'BAIXAR';
}

/**
 * O rótulo do botão promete o que vai acontecer.
 *
 * É a mesma regra de `avisoDeDegradacao`: ou o texto corresponde ao gesto, ou
 * o texto muda. Um botão "Compartilhar" que baixa em silêncio é exatamente o
 * tipo de mentira que este projeto trata como o pior desfecho possível.
 */
export function rotuloDeEntrega(entrega: Entrega): string {
  return entrega === 'COMPARTILHAR' ? 'Compartilhar' : 'Baixar';
}

export function ajudaDeEntrega(entrega: Entrega): string {
  return entrega === 'COMPARTILHAR'
    ? 'Abre o WhatsApp, o email e o que mais estiver no aparelho.'
    : 'O arquivo vai para a pasta de downloads deste computador.';
}

export type DesfechoDaEntrega = 'ENTREGUE' | 'CANCELADO' | 'FALHOU';

/**
 * Desistir não é falhar.
 *
 * `navigator.share` rejeita com `AbortError` quando ela fecha a folha de
 * compartilhamento sem escolher nada. Tratar isso como erro produziria duas
 * coisas erradas: um toast vermelho dizendo que não deu, e — se houvesse
 * fallback automático — um arquivo baixado depois de ela ter dito não.
 */
export function desfechoDoErro(erro: unknown): DesfechoDaEntrega {
  const nome = (erro as { name?: string } | null | undefined)?.name;
  return nome === 'AbortError' ? 'CANCELADO' : 'FALHOU';
}

/** O que o arquivo precisa dizer sobre si mesmo. */
export interface Identificacao {
  /** `aulas` ou `pendencias` — o que está dentro. */
  tipo: 'aulas' | 'pendencias';
  /** Disciplinas do recorte. Vazio = todas. */
  disciplinas?: string[];
  /** Turmas do recorte. Vazio = todas. */
  turmas?: string[];
  /** "2026.1" ou "2026", já formatado por `lib/periodo.ts`. */
  periodo?: string;
  /** Quando foi gerado. Injetável para o teste não depender do relógio. */
  em?: Date;
}

/** Tira acento e o que não sobrevive a um nome de arquivo em qualquer sistema. */
function pedaco(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

/**
 * O nome do arquivo é o que identifica a exportação — e é de propósito.
 *
 * A tentação é escrever período e turmas em linhas de cabeçalho dentro do CSV.
 * Isso quebra justamente o que o CSV serve para fazer: quem abrir vê quatro
 * linhas de lixo antes da tabela, e todo importador tropeça. O documento para
 * ler com olho humano é o relatório de impressão, e é lá que a identificação
 * aparece escrita.
 *
 * Aqui ela vai no nome, que é o que ela vê ao anexar no email e o que sobra
 * numa pasta seis meses depois. `historico.csv` e `historico (2).csv` não se
 * distinguem; `aulas-matematica-8-a-2026-1-17-08-2026.csv` se explica sozinho.
 */
export function nomeDoArquivo(id: Identificacao): string {
  const em = id.em ?? new Date();
  const dia = [
    String(em.getDate()).padStart(2, '0'),
    String(em.getMonth() + 1).padStart(2, '0'),
    em.getFullYear(),
  ].join('-');

  const disciplinas = id.disciplinas ?? [];
  const turmas = id.turmas ?? [];

  const partes = [
    id.tipo,
    // Uma disciplina nomeia; várias viram contagem, senão o nome fica maior que
    // a tela do celular na hora de anexar.
    disciplinas.length === 1 ? pedaco(disciplinas[0]) : disciplinas.length > 1 ? `${disciplinas.length}-disciplinas` : '',
    turmas.length === 1 ? pedaco(turmas[0]) : turmas.length > 1 ? `${turmas.length}-turmas` : '',
    id.periodo ? pedaco(id.periodo) : '',
    dia,
  ].filter(Boolean);

  return `${partes.join('-')}.csv`;
}

/* ------------------------------------------------------------------ *
 * Daqui para baixo mexe em `navigator` e no DOM, então não entra nos
 * testes (o ambiente do Jest aqui é `node`). A decisão que importa está
 * acima, pura e coberta.
 * ------------------------------------------------------------------ */

/** Sonda o aparelho com um arquivo de amostra — `canShare` só responde sobre um alvo real. */
export function detectarEntrega(): Entrega {
  if (typeof navigator === 'undefined') return 'BAIXAR';

  const temShare = typeof navigator.share === 'function';
  let aceitaArquivo = false;
  try {
    const amostra = new File(['amostra'], 'amostra.csv', { type: 'text/csv' });
    aceitaArquivo = navigator.canShare?.({ files: [amostra] }) ?? false;
  } catch {
    // Navegador sem `File` utilizável, ou `canShare` que lança em vez de
    // responder. Os dois significam a mesma coisa para nós: não prometer.
    aceitaArquivo = false;
  }

  return decidirEntrega({ temShare, aceitaArquivo });
}

/**
 * Entrega o arquivo pelo gesto que este aparelho realmente faz.
 *
 * Devolve o desfecho em vez de engolir: quem chamou precisa saber a diferença
 * entre "foi", "ela desistiu" e "quebrou" para escolher a mensagem. Não há
 * fallback automático de compartilhar para baixar — depois de ela fechar a
 * folha, um arquivo aparecendo na pasta de downloads seria resposta a uma
 * pergunta que ela respondeu com "não".
 */
export async function entregarArquivo(
  nome: string,
  conteudo: string,
  tipo = 'text/csv;charset=utf-8',
): Promise<DesfechoDaEntrega> {
  const arquivo = new File([conteudo], nome, { type: tipo });

  if (detectarEntrega() === 'COMPARTILHAR') {
    try {
      await navigator.share({ files: [arquivo], title: nome });
      return 'ENTREGUE';
    } catch (erro) {
      return desfechoDoErro(erro);
    }
  }

  const url = URL.createObjectURL(arquivo);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
  return 'ENTREGUE';
}
