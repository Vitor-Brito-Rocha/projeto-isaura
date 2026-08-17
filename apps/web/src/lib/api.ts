import { baseDaApi } from './base-api';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Uma renovação por vez.
 *
 * A tela de aula dispara várias consultas juntas. Sem isto, todas as que
 * levassem 401 no mesmo instante chamariam `/auth/refresh` em paralelo — e o
 * Supabase rotaciona o refresh token a cada uso, então a segunda chamada
 * chegaria com um token já gasto e derrubaria a sessão que a primeira acabou de
 * renovar. Todas esperam a mesma promessa.
 */
let renovacaoEmCurso: Promise<boolean> | null = null;

function renovarSessao(): Promise<boolean> {
  renovacaoEmCurso ??= fetch(`${baseDaApi()}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      renovacaoEmCurso = null;
    });
  return renovacaoEmCurso;
}

/**
 * Wrapper do fetch para a API.
 *
 * `credentials: 'include'` é obrigatório: a sessão vive em cookie httpOnly, que
 * o JavaScript não consegue ler nem anexar manualmente.
 *
 * No 401, tenta renovar a sessão UMA vez e repete a chamada. O access token do
 * Supabase dura ~1h e o refresh dura 30 dias: sem isto, a professora era jogada
 * para o login a cada hora de uso, no meio do registro de uma aula, mesmo com
 * sessão válida no cookie de refresh.
 */
export async function apiFetch<T = unknown>(
  caminho: string,
  init: RequestInit = {},
): Promise<T> {
  const enviar = () =>
    fetch(`${baseDaApi()}${caminho}`, {
      ...init,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...init.headers },
    });

  let resposta = await enviar();

  // As próprias rotas de auth ficam de fora: um 401 em /auth/login é senha
  // errada, e tentar renovar ali viraria laço.
  if (resposta.status === 401 && !caminho.startsWith('/auth/')) {
    if (await renovarSessao()) resposta = await enviar();
  }

  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => ({}));
    // A API devolve `message` como string ou array (validação do class-validator).
    const bruta = (corpo as { message?: string | string[] }).message;
    const mensagem = Array.isArray(bruta) ? bruta.join('. ') : bruta;
    throw new ApiError(resposta.status, mensagem ?? 'Não foi possível completar a ação.');
  }

  if (resposta.status === 204) return undefined as T;
  return resposta.json() as Promise<T>;
}
