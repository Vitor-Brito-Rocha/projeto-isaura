/**
 * O plano de curso escrito dela virando unidades e tópicos.
 *
 * Mesmo desenho do `resumo.prompt.ts`: puro, testável, e a saída é **sempre
 * rascunho**. Aqui a regra vale dobrado — um plano importado com a unidade 3
 * errada contamina todo registro que apontar para ela, e o erro só aparece
 * meses depois, quando ela for olhar o progresso da turma.
 */

/** Os limites são os do `CreateUnidadeDto`/`CreateTopicoDto`, repetidos aqui
 *  para o texto já chegar cortado em vez de a criação falhar na validação.
 *  Exportados porque o parser da Unifor (`unifor.ts`) corta pelos mesmos: dois
 *  caminhos de importação com tetos diferentes dariam um documento que entra
 *  por um e é recusado pelo outro. */
export const MAX_TITULO = 200;
export const MAX_UNIDADES = 40;
export const MAX_TOPICOS = 60;

export interface UnidadeExtraida {
  titulo: string;
  topicos: string[];
}

/** O que o modelo devolve, antes de qualquer saneamento. */
export interface PlanoBruto {
  unidades: { titulo: string; topicos: string[] }[];
}

export const SISTEMA_PLANO = `Você lê o plano de curso de uma professora e extrai a estrutura dele: as unidades e, dentro de cada uma, os tópicos.

Unidade é a divisão maior do curso — bimestre, capítulo, módulo, semana. Tópico é o assunto dentro dela, o que se dá numa aula ou duas.

Copie os títulos como estão escritos no documento. Não reescreva, não melhore, não traduza, não padronize a numeração: ela vai reconhecer o próprio plano, e um título "corrigido" a faz desconfiar da importação inteira.

Não invente unidade nem tópico. Se o documento tiver só as unidades, sem detalhar os assuntos, devolva cada unidade com a lista de tópicos vazia — é uma resposta correta.

Ignore o que não faz parte da estrutura do curso: cabeçalho da escola, nome da professora, carga horária, critérios de avaliação, bibliografia, assinatura e número de página.

Se o documento não for um plano de curso, devolva a lista de unidades vazia.`;

/**
 * Schema fixo — diferente do de resumo, aqui não há lista fechada de valores
 * válidos para virar `enum`: o conteúdo é justamente o que ainda não existe no
 * banco. A garantia que sobra é de forma, e o saneamento fica em `aplicarPlano`.
 *
 * Todo campo obrigatório e `additionalProperties: false`, que são as exigências
 * do modo estrito da Groq — o mesmo objeto serve aos dois provedores.
 */
export const ESQUEMA_PLANO: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['unidades'],
  properties: {
    unidades: {
      type: 'array',
      description: 'As unidades do curso, na ordem em que aparecem no documento.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['titulo', 'topicos'],
        properties: {
          titulo: {
            type: 'string',
            description: 'Título da unidade, copiado do documento.',
          },
          topicos: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Assuntos dentro da unidade, copiados do documento. Vazia se o documento não detalha.',
          },
        },
      },
    },
  },
};

export function montarPromptPlano(textoDoDocumento: string): string {
  return ['<documento>', textoDoDocumento.trim(), '</documento>'].join('\n');
}

function titulo(bruto: unknown): string {
  return typeof bruto === 'string' ? bruto.replace(/\s+/g, ' ').trim().slice(0, MAX_TITULO) : '';
}

/**
 * Saneia o que veio do modelo.
 *
 * O schema garante a forma, não o conteúdo. O que some aqui:
 *
 * - título vazio, que viraria unidade sem nome na tela e falharia no
 *   `@MinLength(1)` do DTO;
 * - repetido, porque documento com sumário e corpo faz o modelo listar a mesma
 *   unidade duas vezes — e duas unidades de mesmo nome são indistinguíveis no
 *   select do fechamento;
 * - excesso, que é o sinal de que ele leu uma tabela como se fosse currículo.
 *
 * A comparação de repetido é sem acento e sem caixa: "Álgebra" e "ALGEBRA" no
 * sumário e no corpo são a mesma unidade.
 */
export function aplicarPlano(bruto: PlanoBruto): UnidadeExtraida[] {
  const unidades = Array.isArray(bruto?.unidades) ? bruto.unidades : [];
  const vistas = new Set<string>();
  const saida: UnidadeExtraida[] = [];

  for (const u of unidades) {
    const nome = titulo(u?.titulo);
    if (!nome) continue;

    const chave = chaveDeTitulo(nome);
    if (vistas.has(chave)) continue;
    vistas.add(chave);

    const topicosVistos = new Set<string>();
    const topicos: string[] = [];
    for (const t of Array.isArray(u?.topicos) ? u.topicos : []) {
      const nomeTopico = titulo(t);
      if (!nomeTopico) continue;
      const chaveTopico = chaveDeTitulo(nomeTopico);
      if (topicosVistos.has(chaveTopico)) continue;
      topicosVistos.add(chaveTopico);
      topicos.push(nomeTopico);
      if (topicos.length >= MAX_TOPICOS) break;
    }

    saida.push({ titulo: nome, topicos });
    if (saida.length >= MAX_UNIDADES) break;
  }

  return saida;
}

function chaveDeTitulo(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}
