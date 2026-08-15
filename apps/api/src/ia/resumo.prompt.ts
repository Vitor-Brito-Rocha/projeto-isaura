import { isoDeDataUTC } from '../common/tz';

/** Unidade + tópicos, como vêm do plano curricular da cadeira. */
export interface UnidadeContexto {
  id: string;
  titulo: string;
  topicos: { id: string; titulo: string }[];
}

export interface DadosDaAula {
  disciplina: string;
  turma: string;
  anoLetivo: number;
  data: Date;
  horaInicio: string;
  horaFim: string;
  planoPrevisto: string | null;
  unidades: UnidadeContexto[];
}

/** O que o modelo devolve. Números, nunca ids — ver `aplicarResumo`. */
export interface ResumoBruto {
  conteudoDado: string;
  unidade: number;
  topicos: number[];
  atividadeCasa: string;
  dataEntrega: string;
  planoProximaAula: string;
}

/** O rascunho já traduzido para o formato do formulário de fechamento. */
export interface ResumoAplicado {
  conteudoDado: string;
  unidadeId: string | null;
  topicosCobertos: string[];
  atividadeCasa: string;
  dataEntrega: string;
  planoProximaAula: string;
}

export const SISTEMA = `Você transforma a fala de uma professora sobre a aula que ela acabou de dar em um registro escolar padronizado.

Escreva em português do Brasil, curto e concreto, no tom de diário de classe.

Use apenas o que está na fala e no contexto. Não invente conteúdo, exercício, número de página nem data — este registro pode ser apresentado à coordenação, e resumo que inventa tópico é pior que resumo nenhum.

Quando a fala for vaga e apontar para o que estava combinado ("continuei o que eu tinha planejado", "terminei aquilo"), resolva a referência com o plano previsto que está no contexto. É para isso que ele está lá.

Nome de aluno não entra no registro. Se a fala citar alguém, escreva "um aluno" ou "alguns alunos": o registro é sobre a aula, não sobre as pessoas, e são menores de idade.

Escolha unidade e tópicos apenas entre os números listados no contexto. Se nada corresponder com clareza, devolva 0 e lista vazia — a professora marca na mão.

Campo sobre o qual a fala não disse nada: devolva string vazia. Não deduza.`;

/**
 * Schema da saída.
 *
 * Todos os campos são obrigatórios e nenhum é nulável: "não sei" é string
 * vazia, 0 ou lista vazia. Sai mais feio que um union com `null`, mas o
 * contrato fica o mais simples que a API garante, e o código que lê não
 * precisa de um ramo por campo ausente.
 *
 * Nenhum campo de pessoa existe aqui de propósito. A regra de LGPD não pode
 * depender só da instrução no prompt: se não há onde escrever um nome, não
 * há como um nome vazar por desobediência do modelo.
 */
export const ESQUEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: [
    'conteudoDado',
    'unidade',
    'topicos',
    'atividadeCasa',
    'dataEntrega',
    'planoProximaAula',
  ],
  properties: {
    conteudoDado: {
      type: 'string',
      description: 'O que foi efetivamente dado, em uma ou duas frases. Vazio se a fala não disser.',
    },
    unidade: {
      type: 'integer',
      description: 'Número da unidade na lista do contexto. 0 quando nenhuma corresponde.',
    },
    topicos: {
      type: 'array',
      items: { type: 'integer' },
      description: 'Números dos tópicos cobertos, da lista do contexto. Vazia se nenhum corresponde.',
    },
    atividadeCasa: {
      type: 'string',
      description: 'Tarefa passada para casa. Vazio se não houve.',
    },
    dataEntrega: {
      type: 'string',
      description: 'Entrega da tarefa, no formato AAAA-MM-DD. Vazio se não houve.',
    },
    planoProximaAula: {
      type: 'string',
      description: 'O que ela disse que vai dar na próxima aula desta turma. Vazio se não disse.',
    },
  },
};

const DIAS = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
];

interface TopicoNumerado {
  numero: number;
  unidade: number;
  id: string;
  titulo: string;
}

/**
 * Numera os tópicos de todas as unidades numa sequência só.
 *
 * O modelo trabalha com esses números e nunca vê um uuid: fora de economizar
 * token, é o que impede uma alucinação de id de virar tópico marcado — número
 * fora da lista simplesmente não existe no mapa.
 */
export function numerarTopicos(unidades: UnidadeContexto[]): TopicoNumerado[] {
  const lista: TopicoNumerado[] = [];
  unidades.forEach((u, iu) => {
    for (const t of u.topicos) {
      lista.push({ numero: lista.length + 1, unidade: iu + 1, id: t.id, titulo: t.titulo });
    }
  });
  return lista;
}

export function montarPrompt(aula: DadosDaAula, transcricao: string): string {
  const linhas = [
    '<contexto>',
    `Cadeira: ${aula.disciplina} — ${aula.turma} (${aula.anoLetivo})`,
    `Aula de ${isoDeDataUTC(aula.data)} (${DIAS[aula.data.getUTCDay()]}), ${aula.horaInicio} às ${aula.horaFim}`,
    'Datas relativas na fala ("na sexta", "semana que vem") contam a partir desta data.',
  ];

  // O plano previsto é o que resolve "continuei o que eu tinha planejado". Sem
  // ele a frase fica como está, e o resumo vira genérico — é o único ponto em
  // que o contexto muda a qualidade da saída, não só a forma.
  const plano = aula.planoPrevisto?.trim();
  linhas.push(
    plano
      ? `\nO que ela planejou dar nesta aula:\n${plano}`
      : '\nEla não registrou plano previsto para esta aula.',
  );

  if (aula.unidades.length) {
    linhas.push('\nUnidades do plano curricular:');
    aula.unidades.forEach((u, i) => linhas.push(`  ${i + 1}. ${u.titulo}`));

    const topicos = numerarTopicos(aula.unidades);
    if (topicos.length) {
      linhas.push('\nTópicos:');
      for (const t of topicos) {
        linhas.push(`  ${t.numero}. [unidade ${t.unidade}] ${t.titulo}`);
      }
    }
  } else {
    linhas.push('\nEsta cadeira não segue plano curricular: devolva unidade 0 e tópicos vazios.');
  }

  linhas.push('</contexto>', '', '<fala>', transcricao.trim(), '</fala>');
  return linhas.join('\n');
}

function texto(bruto: unknown, limite: number): string {
  return typeof bruto === 'string' ? bruto.trim().slice(0, limite) : '';
}

/** Só passa data que o `<input type="date">` do formulário consegue exibir. */
function dataValida(bruto: unknown): string {
  if (typeof bruto !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(bruto)) return '';
  const d = new Date(`${bruto}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? '' : bruto;
}

/**
 * Traduz os números que o modelo devolveu para os ids reais.
 *
 * Faz duas coisas além da tradução, e as duas existem por causa da tela:
 *
 * 1. **Descarta número fora da lista.** O schema garante que veio um inteiro,
 *    não que o inteiro existe. É a mesma fronteira que `garantirTopicos`
 *    defende no fechamento, um passo antes.
 * 2. **Mantém unidade e tópicos coerentes.** O formulário só mostra os tópicos
 *    da unidade escolhida, então tópico de outra unidade viraria marcação
 *    invisível: gravada no banco e impossível de desmarcar na tela.
 */
export function aplicarResumo(bruto: ResumoBruto, unidades: UnidadeContexto[]): ResumoAplicado {
  const numerados = numerarTopicos(unidades);
  const porNumero = new Map(numerados.map((t) => [t.numero, t]));

  const escolhidos = [...new Set(Array.isArray(bruto.topicos) ? bruto.topicos : [])]
    .map((n) => porNumero.get(n))
    .filter((t): t is TopicoNumerado => Boolean(t));

  // Sem unidade explícita mas com tópicos, a unidade sai dos próprios tópicos:
  // ela disse o conteúdo, só não nomeou a unidade.
  const indice =
    unidades[bruto.unidade - 1] !== undefined ? bruto.unidade : (escolhidos[0]?.unidade ?? 0);
  const unidade = unidades[indice - 1] ?? null;

  return {
    conteudoDado: texto(bruto.conteudoDado, 4000),
    unidadeId: unidade?.id ?? null,
    topicosCobertos: escolhidos.filter((t) => t.unidade === indice).map((t) => t.id),
    atividadeCasa: texto(bruto.atividadeCasa, 2000),
    dataEntrega: dataValida(bruto.dataEntrega),
    planoProximaAula: texto(bruto.planoProximaAula, 4000),
  };
}
