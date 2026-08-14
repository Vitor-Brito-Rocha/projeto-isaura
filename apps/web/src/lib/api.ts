const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Wrapper do fetch para a API.
 *
 * `credentials: 'include'` é obrigatório: a sessão vive em cookie httpOnly, que
 * o JavaScript não consegue ler nem anexar manualmente. Sem isso toda chamada
 * autenticada volta 401 sem explicação óbvia.
 */
export async function apiFetch<T = unknown>(
  caminho: string,
  init: RequestInit = {},
): Promise<T> {
  const resposta = await fetch(`${BASE}${caminho}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });

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
