'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { armazenamentoDosRascunhos, type ArmazenamentoDe } from './armazenamento-idb';
import {
  assinatura,
  guardar,
  mesmosValores,
  podar,
  recuperar,
  remover,
  type RascunhoLocal,
} from './rascunho-local';

/**
 * Dois lugares, duas falhas diferentes.
 *
 * A **memória** é a lista viva do app: leitura síncrona, e é ela que faz a
 * troca entre "o que planejo dar" e "o que eu dei" não perder nada — as duas
 * abas são componentes distintos, e trocar desmonta um e monta o outro.
 * O **IndexedDB** cobre a outra falha, a de fechar o app.
 *
 * Fossem só o disco, a volta da aba teria uma leitura assíncrona no meio: a
 * tela pintaria em branco e o texto apareceria depois — ou não apareceria, se
 * ela começasse a digitar antes. Fosse só a memória, fechar o app apagaria
 * tudo, que é o problema original.
 */
let memoria: RascunhoLocal[] = [];
let hidratado = false;
let hidratacao: Promise<void> | null = null;
let ouvindoSaida = false;
let armazenamento: ArmazenamentoDe<RascunhoLocal> | null = null;

function loja(): ArmazenamentoDe<RascunhoLocal> {
  armazenamento ??= armazenamentoDosRascunhos();
  return armazenamento;
}

/**
 * Grava a memória no disco.
 *
 * **Nunca antes da hidratação**: a memória vazia do boot sobrescreveria o que
 * está guardado, e o rascunho morreria justamente na abertura do app — o único
 * momento em que ele importa.
 */
function persistir(): void {
  if (!hidratado) return;
  memoria = podar(memoria, Date.now());
  void loja().gravar(memoria);
}

function ouvirSaida(): void {
  if (ouvindoSaida || typeof document === 'undefined') return;
  ouvindoSaida = true;

  // Ir para segundo plano é o mais perto de "ela fechou o app" que o celular
  // entrega: `beforeunload` não é confiável no iOS, e o sistema pode matar a
  // aba sem avisar. Gravar aqui é o que impede a perda dos últimos segundos de
  // digitação, que o atraso do disco ainda estava segurando.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') persistir();
  });
  window.addEventListener('pagehide', () => persistir());
}

/**
 * Lê o disco uma vez por carregamento do app.
 *
 * Chamada no `Providers`, e não na tela da aula: quando o formulário monta, a
 * leitura já terminou faz tempo (ela passou pela home e por uma ida ao
 * servidor), então a recuperação do rascunho é síncrona e sem piscada.
 */
export function hidratarRascunhos(): Promise<void> {
  hidratacao ??= loja()
    .ler()
    .then((lista) => {
      memoria = podar(lista, Date.now());
    })
    .catch(() => {
      /* sem disco o rascunho vale só para esta sessão — melhor que nada */
    })
    .finally(() => {
      hidratado = true;
      ouvirSaida();
    });
  return hidratacao;
}

/** Quanto tempo parada antes de o rascunho descer para o disco. */
const ATRASO_MS = 600;

/**
 * Guarda o formulário enquanto ela digita, e devolve o que sobrou da última vez.
 *
 * `local` não muda a cada tecla de propósito: se mudasse, o efeito que aplica
 * os valores rodaria a cada letra e o cursor pularia para o fim do texto.
 *
 * **Quem usa aplica em DOIS efeitos, nesta ordem**: primeiro `doServidor`,
 * depois `local`. Assim o rascunho entra por cima na montagem — ele é o mais
 * recente — mas deixa de mandar depois disso. Num efeito só
 * (`aplicar(local ?? doServidor)`), toda mudança do servidor reaplicaria o
 * rascunho: ela recupera o texto, corrige, salva, a consulta volta — e a
 * correção sumia, substituída pela versão recuperada. O rascunho é com o que a
 * tela ABRE, não uma fonte que continua valendo.
 */
export function useRascunhoLocal<T extends object>(
  chave: string,
  valores: T,
  doServidor: T,
): { local: T | null; recuperado: boolean; descartar: () => void } {
  const [local, setLocal] = useState<T | null>(() => recuperar<T>(memoria, chave, doServidor));

  const atual = useRef({ valores, doServidor });
  atual.current = { valores, doServidor };

  useEffect(() => {
    if (hidratado) return;

    // Disco lento ou app aberto direto nesta tela pelo alarme: o rascunho chega
    // depois da primeira pintura. Só entra se ela ainda não tiver mexido em
    // nada — restaurar por cima do que ela acabou de escrever seria o próprio
    // acidente que este arquivo existe para evitar.
    let vivo = true;
    void hidratarRascunhos().then(() => {
      if (!vivo) return;
      const agora = atual.current;
      if (!mesmosValores(agora.valores, agora.doServidor)) return;
      setLocal(recuperar<T>(memoria, chave, agora.doServidor));
    });
    return () => {
      vivo = false;
    };
  }, [chave]);

  // A assinatura, e não o objeto, é a dependência: `valores` nasce novo a cada
  // render e o efeito rodaria sempre, gravando no disco a cada pintura da tela.
  const marca = assinatura(valores);
  const marcaDoServidor = assinatura(doServidor);

  useEffect(() => {
    // `atual.current.valores` e não a closure: a dependência é a assinatura, e
    // ler daqui deixa explícito que o objeto vem do render que a mudou.
    memoria =
      marca === marcaDoServidor
        ? remover(memoria, chave)
        : guardar(memoria, chave, atual.current.valores, Date.now());

    const t = setTimeout(persistir, ATRASO_MS);
    return () => clearTimeout(t);
  }, [chave, marca, marcaDoServidor]);

  const descartar = useCallback(() => {
    memoria = remover(memoria, chave);
    setLocal(null);
    persistir();
  }, [chave]);

  /**
   * Se o aviso de "isto não foi salvo" deve estar na tela AGORA.
   *
   * Não basta existir rascunho recuperado — as outras duas condições são o que
   * impedem o aviso de mentir.
   *
   * `marca === assinatura(local)`: o que está nos campos ainda é o rascunho
   * recuperado. Depois que ela digita por cima, quem escreveu aquilo foi ela,
   * agora, e anunciar recuperação vira ruído.
   *
   * `marca !== marcaDoServidor`: e ainda não é o que está gravado. Sem esta, o
   * aviso sobreviveria ao salvamento — ela salva exatamente o texto
   * recuperado, a consulta volta com ele, e a tela continuaria dizendo que
   * aquilo não foi salvo.
   */
  const recuperado = local !== null && marca === assinatura(local) && marca !== marcaDoServidor;

  return { local, recuperado, descartar };
}
