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

/** Está apontando para outro lugar que não o do build? A tela avisa quando sim. */
export function estaAlternada(): boolean {
  return baseDaApi() !== BASE_PADRAO;
}
