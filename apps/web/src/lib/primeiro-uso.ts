'use client';

import type { Capacidade } from './capacidade';

/**
 * O que oferecer a ela na home, e quando calar a boca.
 *
 * O produto inteiro se apoia num alarme que toca. Deixar isso escondido atrás
 * de Ajustes é o desfecho pior de todos: ela usa por uma semana, nada avisa
 * nada, e conclui que o app não funciona — quando na verdade nunca foi ligado.
 *
 * **Nunca pedir a permissão sozinho.** O navegador só dá uma chance: recusa de
 * notificação é quase irreversível no celular (exige achar as configurações do
 * site), e prompt sem contexto é recusado. Por isso o passo é um cartão que
 * EXPLICA e um botão que ela clica — a permissão do sistema só aparece depois
 * do gesto dela.
 */
export type PassoInicial = 'INSTALAR_IOS' | 'ATIVAR_NOTIFICACOES' | 'AJUSTAR_PADROES' | null;

/**
 * Dispensar silencia por uma semana, não para sempre.
 *
 * "Para sempre" transforma um toque errado em app mudo pelo resto do ano, e ela
 * não vai desconfiar que existe um cartão que ela mesma apagou. Uma semana é
 * longo o bastante para não virar praga e curto o bastante para o produto não
 * falhar calado na única coisa que promete.
 */
export const DIAS_DE_SILENCIO = 7;
const UMA_SEMANA = DIAS_DE_SILENCIO * 24 * 3600 * 1000;

export interface EstadoInicial {
  capacidade: Capacidade;
  notificacoesAtivas: boolean;
  jaAjustouPadroes: boolean;
  /** Quando cada passo foi dispensado, em ms. */
  dispensas: Partial<Record<Exclude<PassoInicial, null>, number>>;
  agora: number;
}

export function proximoPasso(e: EstadoInicial): PassoInicial {
  const silenciado = (passo: Exclude<PassoInicial, null>) => {
    const quando = e.dispensas[passo];
    return quando !== undefined && e.agora - quando < UMA_SEMANA;
  };

  // Sem suporte nenhum não há o que oferecer, e oferecer seria prometer alarme
  // que não toca — a única coisa que este produto não pode fazer.
  if (e.capacidade === 'SEM_SUPORTE') return null;

  // No iPhone a Push API só existe para app instalado na tela inicial. Pedir
  // permissão antes disso falha, e o erro não diz o que fazer — então o passo
  // aqui é instalar, não ativar.
  if (e.capacidade === 'IOS_NAVEGADOR') {
    return silenciado('INSTALAR_IOS') ? null : 'INSTALAR_IOS';
  }

  if (!e.notificacoesAtivas) {
    return silenciado('ATIVAR_NOTIFICACOES') ? null : 'ATIVAR_NOTIFICACOES';
  }

  // Só depois de o alarme existir. Perguntar "de quantos minutos antes você
  // quer?" antes de haver aviso nenhum é pedir opinião sobre o que ela ainda
  // não viu funcionar.
  if (!e.jaAjustouPadroes) {
    return silenciado('AJUSTAR_PADROES') ? null : 'AJUSTAR_PADROES';
  }

  return null;
}

const CHAVE_DISPENSAS = 'isaura.primeiro-uso.dispensas';
const CHAVE_PADROES = 'isaura.primeiro-uso.padroes-ajustados';

function comStorage<T>(acao: () => T, padrao: T): T {
  if (typeof window === 'undefined') return padrao;
  try {
    return acao();
  } catch {
    // Navegação privada bloqueia localStorage em alguns navegadores. Sem
    // memória, o cartão reaparece — irritante, nunca quebrado.
    return padrao;
  }
}

export function lerDispensas(): EstadoInicial['dispensas'] {
  return comStorage(() => {
    const cru = window.localStorage.getItem(CHAVE_DISPENSAS);
    return cru ? (JSON.parse(cru) as EstadoInicial['dispensas']) : {};
  }, {});
}

export function dispensar(passo: Exclude<PassoInicial, null>, agora = Date.now()): void {
  comStorage(() => {
    const atual = lerDispensas();
    window.localStorage.setItem(CHAVE_DISPENSAS, JSON.stringify({ ...atual, [passo]: agora }));
  }, undefined);
}

/**
 * Por aparelho, e não por conta, de propósito nos dois casos.
 *
 * A permissão de notificação É por aparelho — o servidor não tem como saber se
 * este celular está inscrito sem consultar a subscription. E para os padrões,
 * o sinal de conta que existiria (`atualizadoEm`) é reescrito a cada login pelo
 * upsert do `garantirPerfil`, então não distingue "nunca mexeu" de "entrou hoje".
 * Preço: ela vê a sugestão uma vez em cada aparelho. Aceitável para uma dica.
 */
export function jaAjustouPadroes(): boolean {
  return comStorage(() => window.localStorage.getItem(CHAVE_PADROES) === '1', false);
}

export function marcarPadroesAjustados(): void {
  comStorage(() => window.localStorage.setItem(CHAVE_PADROES, '1'), undefined);
}
