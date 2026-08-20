import { MAX_TITULO, MAX_TOPICOS, MAX_UNIDADES } from './plano.prompt';
import { decodificarHorarios, type HorarioDaTurma } from './unifor-horarios';

/**
 * O `Plano de Ensino` da Unifor, lido sem modelo nenhum.
 *
 * Formato regular não precisa de IA. Um parser é grátis, instantâneo, funciona
 * sem rede e **não tem como alucinar** — que é o que importa, porque nas
 * palavras do próprio `plano.prompt.ts` "um plano importado com a unidade 3
 * errada contamina todo registro que apontar para ela", e o erro só aparece
 * meses depois. O caminho da Groq continua existindo para todo documento que
 * este parser não reconhecer.
 *
 * ## O que este arquivo NÃO lê, de propósito
 *
 * **O pareamento data → tópico do CRONOGRAMA.** Aquela tabela não tem régua
 * entre as linhas: das 244 operações de desenho do PDF, as réguas horizontais
 * são uma ou duas por página, e são separadores de seção. A célula de data é
 * centralizada verticalmente contra um bloco de conteúdo de altura variável, e
 * onde a linha é alta não sobra critério para dizer onde ela termina. Três
 * métodos independentes (ordem do texto, centro da célula mais próxima, réguas
 * da tabela) discordam sobre as mesmas linhas.
 *
 * Some a isso a qualidade do que está escrito: no plano medido, `03.01` aparece
 * em 11 aulas seguidas enquanto `03.02`, `03.03` e `03.04` aparecem uma vez
 * cada. Mesmo lido corretamente, aquilo não serve como "o que planejo dar".
 *
 * Por isso o cronograma entra aqui só como **lista de datas**, que é a coluna
 * confiável, e o que cai em cada data é ESTIMADO a partir das horas-aula
 * declaradas (ver `planos/cronograma.ts`). Ler mal aquela tabela poria conteúdo
 * errado no alarme, que é o pior desfecho deste produto.
 */

const MESES: Record<string, number> = {
  JANEIRO: 1,
  FEVEREIRO: 2,
  MARCO: 3,
  ABRIL: 4,
  MAIO: 5,
  JUNHO: 6,
  JULHO: 7,
  AGOSTO: 8,
  SETEMBRO: 9,
  OUTUBRO: 10,
  NOVEMBRO: 11,
  DEZEMBRO: 12,
};

const ROMANOS: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100 };

export interface UnidadeUnifor {
  ordem: number;
  titulo: string;
  /** Horas-aula declaradas entre parênteses. Null quando o plano não declara. */
  cargaHoraria: number | null;
  /** Copiados como estão, com o código: é assim que ela reconhece o próprio plano. */
  topicos: string[];
}

export interface PlanoUnifor {
  ano: number | null;
  semestre: number | null;
  disciplina: string | null;
  /** O `T203 - 30(31)` do documento, para ela conferir que é a turma certa. */
  codigoTurma: string | null;
  horarios: HorarioDaTurma[];
  unidades: UnidadeUnifor[];
  /** Datas do cronograma, "YYYY-MM-DD", únicas e em ordem. Sem conteúdo. */
  encontros: string[];
}

function romano(s: string): number | null {
  let total = 0;
  for (let i = 0; i < s.length; i++) {
    const v = ROMANOS[s[i]];
    if (!v) return null;
    total += v < (ROMANOS[s[i + 1]] ?? 0) ? -v : v;
  }
  return total || null;
}

/** O trecho entre dois cabeçalhos de seção. */
function secao(texto: string, de: RegExp, ate: RegExp): string {
  const inicio = de.exec(texto);
  if (!inicio) return '';
  const resto = texto.slice(inicio.index + inicio[0].length);
  const fim = ate.exec(resto);
  return fim ? resto.slice(0, fim.index) : resto;
}

const RE_UNIDADE = /^UNIDADE\s+([IVXLC]+)\s*[-–—]\s*(.+?)\s*$/;
const RE_CARGA = /\(\s*(\d+)\s*h\/a\s*\)\s*$/;
const RE_TOPICO = /^(\d{2})\.(\d{2})\s*[-–—]\s*(.+)$/;

/**
 * Reconhece o formato antes de tentar lê-lo.
 *
 * Três marcas juntas, e não uma: "CRONOGRAMA" sozinho aparece em plano de
 * qualquer escola, e aceitar o documento errado aqui é pior do que não
 * reconhecer nenhum — o parser devolveria unidades pela metade e a professora
 * não teria como saber que faltou coisa. Não reconhecendo, o `ImportacaoService`
 * cai no caminho da Groq, que lê documento de formato livre.
 */
export function ehPlanoUnifor(texto: string): boolean {
  return (
    /PLANO DE ENSINO/i.test(texto) &&
    /OBJETIVOS\s*\/\s*CONTE[ÚU]DOS/i.test(texto) &&
    RE_UNIDADE.test(
      secao(texto, /OBJETIVOS\s*\/\s*CONTE[ÚU]DOS/i, /^CRONOGRAMA\s*$/m)
        .split('\n')
        .map((l) => l.trim())
        .find((l) => l.startsWith('UNIDADE')) ?? '',
    )
  );
}

/**
 * As unidades e seus tópicos.
 *
 * **O código do tópico é que diz a unidade, não a posição no texto.** `03.02`
 * pertence à UNIDADE III mesmo se estiver escrito no meio da IV — e é essa
 * âncora que faz o parser não depender da ordem de leitura, que é justamente o
 * que se perde num PDF. Tópico com código sem unidade correspondente é
 * descartado em vez de virar unidade nova.
 */
function lerUnidades(secaoConteudos: string): UnidadeUnifor[] {
  const unidades = new Map<number, UnidadeUnifor>();

  for (const bruta of secaoConteudos.split('\n')) {
    const linha = bruta.trim();

    const casaUnidade = RE_UNIDADE.exec(linha);
    if (casaUnidade) {
      const ordem = romano(casaUnidade[1]);
      if (!ordem || unidades.has(ordem)) continue;

      if (unidades.size >= MAX_UNIDADES) continue;

      const carga = RE_CARGA.exec(casaUnidade[2]);
      unidades.set(ordem, {
        ordem,
        // As horas-aula saem do título: são dado, não nome. Deixá-las ali as
        // levaria para o select do fechamento e para o relatório que sai para
        // a coordenação.
        titulo: casaUnidade[2].replace(RE_CARGA, '').trim().slice(0, MAX_TITULO),
        cargaHoraria: carga ? Number(carga[1]) : null,
        topicos: [],
      });
      continue;
    }

    const casaTopico = RE_TOPICO.exec(linha);
    if (!casaTopico) continue;

    const dona = unidades.get(Number(casaTopico[1]));
    if (!dona || dona.topicos.length >= MAX_TOPICOS) continue;
    if (!dona.topicos.some((t) => t.startsWith(`${casaTopico[1]}.${casaTopico[2]}`))) {
      dona.topicos.push(linha.replace(/\s+/g, ' ').slice(0, MAX_TITULO));
    }
  }

  return [...unidades.values()].sort((a, b) => a.ordem - b.ordem);
}

/**
 * Só as datas do cronograma.
 *
 * O ano vem do cabeçalho de mês (`AGOSTO 2026`) e não do período do documento:
 * um semestre pode atravessar a virada do ano, e `10/01` com o ano de `2026.2`
 * cairia doze meses no passado — uma grade inteira materializada no lugar
 * errado, sem nada na tela denunciando.
 */
function lerEncontros(secaoCronograma: string, anoPadrao: number | null): string[] {
  const datas = new Set<string>();
  let ano = anoPadrao;

  for (const bruta of secaoCronograma.split('\n')) {
    const linha = bruta.trim();

    const casaMes = /^([A-ZÇÃ]+)\s+(\d{4})$/.exec(linha.toUpperCase().replace(/Ç/g, 'C'));
    if (casaMes && MESES[casaMes[1]]) {
      ano = Number(casaMes[2]);
      continue;
    }

    // `(?!\d)` e não `\b`: no texto extraído a data vem colada no dia da
    // semana (`01/12Ter`), e entre `2` e `T` não há fronteira de palavra — as
    // duas únicas datas sem conteúdo do plano medido sumiam por isso.
    const casaData = /^(\d{2})\/(\d{2})(?!\d)/.exec(linha);
    if (!casaData || !ano) continue;

    const dia = Number(casaData[1]);
    const mes = Number(casaData[2]);
    if (dia < 1 || dia > 31 || mes < 1 || mes > 12) continue;

    datas.add(`${ano}-${casaData[2]}-${casaData[1]}`);
  }

  return [...datas].sort();
}

/**
 * Os campos de identificação, reconhecidos pela FORMA e não pela posição.
 *
 * O bloco vem embaralhado no texto extraído — os rótulos saem todos juntos e
 * depois os valores, em outra ordem, porque é uma tabela de duas colunas. Casar
 * rótulo com valor por vizinhança daria disciplina no campo de horário. Cada
 * valor tem forma própria (`M3EF (30)`, `T203 - 30(31)`, `J16 (30)`), e o que
 * sobra sem parênteses é o nome da disciplina.
 */
function lerIdentificacao(secaoDados: string): Pick<PlanoUnifor, 'disciplina' | 'codigoTurma' | 'horarios'> {
  let disciplina: string | null = null;
  let codigoTurma: string | null = null;
  let horarios: HorarioDaTurma[] = [];

  for (const bruta of secaoDados.split('\n')) {
    const linha = bruta.trim();
    if (!linha || linha.endsWith(':') || /Cr[ée]ditos|Professor\(es\)/i.test(linha)) continue;

    if (!horarios.length) {
      const achados = decodificarHorarios(linha);
      // Todos os pedaços têm de decodificar: `J16 (30), J16 (31)` não pode
      // passar por horário só porque tem a mesma pontuação.
      if (achados.length && achados.length === linha.split(',').length) {
        horarios = achados;
        continue;
      }
    }

    if (!codigoTurma && /^[A-Z]\d{2,4}\s*[-–]\s*\d+/.test(linha)) {
      codigoTurma = linha;
      continue;
    }

    if (!disciplina && !linha.includes('(') && /[a-záéíóúâêôãõç]/.test(linha)) {
      disciplina = linha;
    }
  }

  return { disciplina, codigoTurma, horarios };
}

/**
 * Lê o documento inteiro, ou devolve `null` quando não é um plano da Unifor.
 *
 * `null` e não um objeto vazio: quem chama precisa distinguir "não é este
 * formato" (e então tentar o modelo) de "é este formato e está vazio".
 */
export function lerPlanoUnifor(texto: string): PlanoUnifor | null {
  if (!ehPlanoUnifor(texto)) return null;

  const periodo = /PLANO DE ENSINO\s+(\d{4})(?:\s*[.\/]\s*([12]))?/i.exec(texto);
  const ano = periodo ? Number(periodo[1]) : null;

  const unidades = lerUnidades(
    secao(texto, /OBJETIVOS\s*\/\s*CONTE[ÚU]DOS/i, /^CRONOGRAMA\s*$/m),
  );
  if (unidades.length === 0) return null;

  return {
    ano,
    semestre: periodo?.[2] ? Number(periodo[2]) : null,
    ...lerIdentificacao(secao(texto, /DADOS DE IDENTIFICA[ÇC][ÃA]O/i, /^S[ÍI]NTESE|^EMENTA/m)),
    unidades,
    encontros: lerEncontros(secao(texto, /^CRONOGRAMA\s*$/m, /^AVALIA[ÇC][ÃA]O\s*$/m), ano),
  };
}
