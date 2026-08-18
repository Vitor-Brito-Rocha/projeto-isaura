/**
 * Para onde o front fala — decidido em tempo de EXECUÇÃO, não de build.
 *
 * `NEXT_PUBLIC_API_URL` é cozida no bundle, então trocar de ambiente exigia um
 * build novo. No navegador isso já incomodava; no APK é pior, porque cada
 * ambiente vira um arquivo diferente para instalar no aparelho. Com a troca em
 * execução, um build só atende local, VPS e o que mais existir.
 *
 * **A troca é opcional e desligada por padrão.** Um endereço de API que
 * qualquer coisa possa mudar é um jeito curto de mandar a sessão dela e o
 * conteúdo das aulas para um servidor estranho. Por isso: só liga com
 * `NEXT_PUBLIC_API_ALTERNAVEL=1` no build, e o valor só entra por digitação na
 * tela de ajustes — nunca por parâmetro de URL, que viajaria num link.
 */
export const BASE_PADRAO = process.env.NEXT_PUBLIC_API_URL ?? '/api';

/** Ligado só nos builds de teste. O build que for para produção não leva. */
export const PODE_ALTERNAR = process.env.NEXT_PUBLIC_API_ALTERNAVEL === '1';

const CHAVE = 'isaura.base-api';

/**
 * Tira o que é digitação, não endereço.
 *
 * A barra final é o caso comum de copiar e colar, e `${base}${caminho}` viraria
 * `//agenda` — que o navegador resolve como outro HOST, não como caminho. Falha
 * confusa o bastante para valer a normalização.
 */
export function normalizarBase(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

/**
 * Diz o que está errado, ou `null` se estiver certo.
 *
 * Devolve a mensagem em vez de um booleano porque a tela precisa dizer O QUÊ
 * está errado — "inválido" sozinho manda ela adivinhar.
 */
export function validarBase(url: string): string | null {
  const base = normalizarBase(url);
  if (!base) return 'Digite o endereço da API.';

  // Só http(s) e caminho relativo. Isto é o que barra `javascript:` e `data:`,
  // que num campo de endereço são execução de código, não navegação.
  if (!/^https?:\/\//.test(base) && !base.startsWith('/')) {
    return 'Precisa começar com http://, https:// ou / (caminho relativo).';
  }

  if (/^https?:\/\/$/.test(base)) return 'Falta o endereço depois do https://.';

  return null;
}

/**
 * Aviso que não impede — a API pode estar atrás de um proxy sem o prefixo.
 *
 * O erro é frequente o bastante para merecer um empurrão: a API monta tudo sob
 * `/api`, e esquecer o sufixo dá 404 em toda chamada, com cara de servidor fora
 * do ar.
 */
export function avisoDeBase(url: string): string | null {
  const base = normalizarBase(url);
  if (!base || validarBase(base)) return null;
  return base.endsWith('/api') ? null : 'Costuma terminar em /api — confira se é isso mesmo.';
}

/** O endereço em uso agora. Cai no padrão do build se não houver troca válida. */
export function baseDaApi(): string {
  if (!PODE_ALTERNAR || typeof window === 'undefined') return BASE_PADRAO;
  try {
    const guardado = window.localStorage.getItem(CHAVE);
    if (!guardado) return BASE_PADRAO;
    // Revalida na leitura: o valor pode ter sido escrito por uma versão antiga
    // do app, ou à mão no console. Endereço guardado não é endereço confiável.
    return validarBase(guardado) ? BASE_PADRAO : normalizarBase(guardado);
  } catch {
    // localStorage bloqueado (navegação privada em alguns navegadores).
    return BASE_PADRAO;
  }
}

/**
 * Avisa quem mostra o endereço na tela.
 *
 * O evento `storage` do navegador só dispara em OUTRA aba, nunca na que
 * escreveu — então, sem este aviso, a faixa de "API alternada" só apareceria
 * depois de recarregar. Justamente na hora em que ela mais importa: logo após a
 * troca, quando as próximas chamadas já vão para outro lugar.
 */
export const EVENTO_BASE_API = 'isaura:base-api';

/** `null` volta para o padrão do build. */
export function definirBaseDaApi(url: string | null): void {
  if (!PODE_ALTERNAR || typeof window === 'undefined') return;
  try {
    if (url === null) window.localStorage.removeItem(CHAVE);
    else window.localStorage.setItem(CHAVE, normalizarBase(url));
  } catch {
    /* sem localStorage não há o que guardar; segue no padrão */
  }
  window.dispatchEvent(new Event(EVENTO_BASE_API));
}

/**
 * Cabeçalhos que TODA chamada leva, seja qual for o corpo.
 *
 * `ngrok-skip-browser-warning` existe por causa de um desfecho que parece bug do
 * app e não é: no plano gratuito, o ngrok intercepta requisições com cara de
 * navegador e responde a SUA página de aviso — `200 OK`, `content-type:
 * text/html`, `ngrok-error-code: ERR_NGROK_6024` — sem sequer chamar a API. O
 * `resposta.json()` estoura em cima de HTML, e o sintoma na tela é uma falha
 * genérica que não aponta para lugar nenhum. Qualquer valor no header basta
 * para o ngrok repassar.
 *
 * Vai sempre, e não só quando o endereço é absoluto, porque o desvio pelo proxy
 * do Next também pode terminar num túnel: o rewrite repassa os cabeçalhos que
 * chegaram, então mandar daqui cobre os dois caminhos. Para quem não é ngrok é
 * um header ignorado — o custo real é um preflight a mais no upload, que é a
 * única chamada que hoje não tem `Content-Type` e por isso ainda não pedia um.
 *
 * NÃO inclui `Content-Type`: o upload manda `FormData`, e o navegador precisa
 * gerar o boundary do multipart sozinho.
 */
export const CABECALHOS_DA_API: Record<string, string> = {
  'ngrok-skip-browser-warning': '1',
};

/**
 * O endereço escolhido é de outro SITE que não a página?
 *
 * "Site" e não "origem": para cookie, `localhost:3000` e `localhost:3333` são o
 * mesmo site (a porta não conta), e avisar ali seria alarme falso. A regra exata
 * é a Public Suffix List, que não existe no navegador — comparar os dois últimos
 * rótulos do host acerta o que importa aqui (`vercel.app` ≠ `ngrok-free.dev`) e,
 * quando erra, erra deixando de avisar. Endereço relativo nunca é outro site.
 */
export function ehOutroSite(base: string, origem: string): boolean {
  const alvo = normalizarBase(base);
  if (!alvo || alvo.startsWith('/')) return false;
  // Mesma deferência do `avisoDeBase`: endereço que nem é válido já tem quem
  // reclame dele. E `new URL('javascript:...')` NÃO lança — devolve hostname
  // vazio, que aqui pareceria "outro site" e viraria aviso errado.
  if (validarBase(alvo)) return false;
  try {
    const doAlvo = new URL(alvo).hostname.split('.').slice(-2).join('.');
    const daPagina = new URL(origem).hostname.split('.').slice(-2).join('.');
    return doAlvo !== daPagina;
  } catch {
    return false;
  }
}

/**
 * Avisa ANTES que o login vai se perder — a falha mais cara que este projeto
 * já produziu.
 *
 * Apontar o front publicado direto para a API custou uma tarde: o login
 * responde 200, o navegador descarta o cookie na chegada e toda tela seguinte
 * volta 401. Nada aparece no log da API além de "sem token", nada aparece na
 * tela além de "sessão expirada", e o palpite natural — "o login quebrou" — é o
 * errado.
 *
 * No iPhone é CERTEZA, não risco: o Safari vem com Prevent Cross-Site Tracking
 * ligado e descarta cookie de outro site mesmo com `SameSite=None; Secure`. Não
 * é ajuste de código nosso e não é coisa que se peça a uma professora desligar.
 * Fora do iOS depende de configuração do navegador, então o texto é outro.
 *
 * Mesma regra do `avisoDeDegradacao`: dizer antes do clique o que o aparelho
 * realmente vai entregar.
 */
export function avisoDeSessaoCruzada(
  base: string,
  origem: string,
  ehIOS: boolean,
): string | null {
  if (!ehOutroSite(base, origem)) return null;

  return ehIOS
    ? 'Neste aparelho a sessão NÃO vai durar: o Safari descarta cookie de outro site, ' +
        'então você entra e a tela seguinte já aparece deslogada. Use o endereço padrão.'
    : 'A sessão pode não durar: falando com outro site, o navegador pode descartar o cookie ' +
        'do login. Se cair para o login sozinho, volte ao endereço padrão.';
}

/** Está apontando para outro lugar que não o do build? A tela avisa quando sim. */
export function estaAlternada(): boolean {
  return baseDaApi() !== BASE_PADRAO;
}
