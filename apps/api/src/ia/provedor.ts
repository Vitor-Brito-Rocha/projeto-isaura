/**
 * Quem gera o rascunho.
 *
 * Existem dois porque a conta da Anthropic está sem saldo e o MVP não pode
 * ficar parado esperando cartão. O prompt e o schema são os mesmos nos dois
 * caminhos (`resumo.prompt.ts`) — o que muda é o transporte.
 */
export type Provedor = 'anthropic' | 'groq';

/**
 * O modelo pequeno basta porque o schema já garante os campos e a saída passa
 * por revisão humana. Critério de upgrade no PLANO: medir com 5 falas reais
 * dela antes de subir.
 */
export const MODELO_ANTHROPIC = 'claude-haiku-4-5';

/**
 * `gpt-oss-120b` e não o 20b: a diferença aparece justamente em resolver
 * referência vaga em português ("continuei o que eu tinha planejado"), que é o
 * único ponto onde este pipeline precisa de cabeça. Os dois aceitam o modo
 * estrito de schema; o 20b erra mais o pt-BR.
 */
export const MODELO_GROQ = 'openai/gpt-oss-120b';

export const GROQ_BASE = 'https://api.groq.com/openai/v1';

/**
 * Decide o provedor a partir do ambiente.
 *
 * `IA_PROVEDOR` manda quando presente, e **não cai para o outro** se a chave
 * dele faltar: escolher em silêncio um provedor que o usuário não pediu é
 * mandar a fala da professora para uma empresa que ele não escolheu.
 *
 * Sem escolha explícita, Anthropic ganha por ser o alvo do projeto.
 */
export function escolherProvedor(env: {
  IA_PROVEDOR?: string;
  ANTHROPIC_API_KEY?: string;
  GROQ_API_KEY?: string;
}): Provedor | null {
  const anthropic = Boolean(env.ANTHROPIC_API_KEY?.trim());
  const groq = Boolean(env.GROQ_API_KEY?.trim());
  const pedido = env.IA_PROVEDOR?.trim().toLowerCase();

  if (pedido === 'groq') return groq ? 'groq' : null;
  if (pedido === 'anthropic') return anthropic ? 'anthropic' : null;

  if (anthropic) return 'anthropic';
  if (groq) return 'groq';
  return null;
}
