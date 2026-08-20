import { baseDaApi, CABECALHOS_DA_API } from './base-api';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /**
     * Não há sessão nenhuma — não é "este endpoint recusou".
     *
     * Só é verdade quando a renovação já foi tentada e falhou. É a diferença
     * entre os dois desfechos que a tela precisa dar: 401 de um endpoint com
     * problema não pode derrubar a sessão inteira, mas 401 com refresh morto
     * não tem segunda leitura — ela não está logada, e mandá-la para a home
     * para descobrir isso de novo é um degrau que não serve para nada.
     */
    readonly sessaoMorta = false,
  ) {
    super(message);
  }
}

/**
 * Vale tentar renovar a sessão depois de um 401 aqui?
 *
 * Não nas rotas que ESTABELECEM sessão: 401 em `/auth/login` é senha errada, e
 * renovar ali viraria laço. Mas `/auth/eu` é rota autenticada comum — barrar a
 * renovação nela (o que uma regra por prefixo `/auth/` fazia) jogava para o
 * login quem só estava com o access token vencido, tendo refresh válido no
 * cookie. É o caso NORMAL depois de uma hora com o app aberto.
 */
export function podeRenovar(caminho: string): boolean {
  return !['/auth/login', '/auth/signup', '/auth/refresh', '/auth/logout'].some((r) =>
    caminho.startsWith(r),
  );
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
    headers: { ...CABECALHOS_DA_API },
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
      headers: { 'Content-Type': 'application/json', ...CABECALHOS_DA_API, ...init.headers },
    });

  let resposta = await enviar();

  let sessaoMorta = false;
  if (resposta.status === 401 && podeRenovar(caminho)) {
    if (await renovarSessao()) resposta = await enviar();
    // A renovação falhou: o cookie de refresh não existe ou já venceu. Daqui
    // para a frente não há sessão a salvar, e a tela pode dizer isso direto.
    else sessaoMorta = true;
  }

  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => ({}));
    // A API devolve `message` como string ou array (validação do class-validator).
    const bruta = (corpo as { message?: string | string[] }).message;
    const mensagem = Array.isArray(bruta) ? bruta.join('. ') : bruta;
    throw new ApiError(
      resposta.status,
      mensagem ?? 'Não foi possível completar a ação.',
      sessaoMorta && resposta.status === 401,
    );
  }

  if (resposta.status === 204) return undefined as T;
  return resposta.json() as Promise<T>;
}

/**
 * Envia um arquivo por multipart.
 *
 * Separado do `apiFetch` porque ele fixa `Content-Type: application/json`, e
 * multipart precisa que o NAVEGADOR gere o cabeçalho — o boundary vai dentro
 * dele, e defini-lo à mão quebra o parse no servidor.
 *
 * O que veio junto ao sair do `fetch` cru: a renovação de sessão no 401. Sem
 * ela, o access token vencido fazia o upload falhar com "sessão expirada" no
 * meio de um anexo que ela acabou de escolher — e o arquivo se perdia, porque o
 * `<input type="file">` já tinha sido consumido.
 */
export async function enviarArquivo<T = unknown>(caminho: string, arquivo: File): Promise<T> {
  const enviar = () => {
    const corpo = new FormData();
    corpo.append('arquivo', arquivo);
    return fetch(`${baseDaApi()}${caminho}`, {
      method: 'POST',
      credentials: 'include',
      headers: { ...CABECALHOS_DA_API },
      body: corpo,
    });
  };

  let resposta = await enviar();

  let sessaoMorta = false;
  if (resposta.status === 401 && podeRenovar(caminho)) {
    if (await renovarSessao()) resposta = await enviar();
    else sessaoMorta = true;
  }

  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => ({}));
    const bruta = (corpo as { message?: string | string[] }).message;
    const mensagem = Array.isArray(bruta) ? bruta.join('. ') : bruta;
    throw new ApiError(
      resposta.status,
      mensagem ?? 'Não foi possível enviar o arquivo.',
      sessaoMorta && resposta.status === 401,
    );
  }

  return resposta.json() as Promise<T>;
}
