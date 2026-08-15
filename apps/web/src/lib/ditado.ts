'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Ditado por voz, sem gravar áudio.
 *
 * O reconhecimento acontece no aparelho (ou no serviço do próprio navegador) e
 * o que sai daqui é texto: nenhum arquivo de áudio existe para subir, guardar
 * ou descartar depois. Isso resolve por construção o pedaço mais desconfortável
 * da LGPD aqui — o áudio é onde o nome de aluno fica literal.
 *
 * Onde a API não existe, o caminho continua sendo o microfone do teclado do
 * sistema, que escreve no mesmo campo. A tela diz isso em vez de esconder o
 * recurso: prometer o que o aparelho não entrega é a regra que este projeto
 * mais evita.
 */

interface ResultadoFala {
  isFinal: boolean;
  0: { transcript: string };
}

interface EventoFala {
  resultIndex: number;
  results: { length: number; [i: number]: ResultadoFala };
}

interface Reconhecimento {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: EventoFala) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

type Construtor = new () => Reconhecimento;

function construtor(): Construtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: Construtor;
    webkitSpeechRecognition?: Construtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function suportaDitado(): boolean {
  return construtor() !== null;
}

export interface Ditado {
  /** Só depois da montagem: no servidor não há `window` para perguntar. */
  disponivel: boolean;
  ouvindo: boolean;
  alternar: () => void;
}

export function useDitado(
  aoTrecho: (trecho: string) => void,
  aoErro?: (mensagem: string) => void,
): Ditado {
  const [disponivel, setDisponivel] = useState(false);
  const [ouvindo, setOuvindo] = useState(false);
  const sessao = useRef<Reconhecimento | null>(null);

  // Os callbacks mudam a cada render do pai. Guardados em ref, `alternar`
  // continua estável e o reconhecimento não é recriado no meio da fala.
  const trecho = useRef(aoTrecho);
  const erro = useRef(aoErro);
  trecho.current = aoTrecho;
  erro.current = aoErro;

  useEffect(() => {
    setDisponivel(suportaDitado());
    return () => sessao.current?.abort();
  }, []);

  const alternar = useCallback(() => {
    if (sessao.current) {
      sessao.current.stop();
      return;
    }

    const Ctor = construtor();
    if (!Ctor) return;

    const r = new Ctor();
    r.lang = 'pt-BR';
    r.continuous = true;
    // Só trechos fechados. Resultado provisório faz o texto piscar e reescrever
    // enquanto ela fala, e o campo é o mesmo que ela vai editar depois.
    r.interimResults = false;

    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        if (e.results[i].isFinal) trecho.current(e.results[i][0].transcript.trim());
      }
    };
    r.onerror = (e) => {
      // `no-speech` e `aborted` são silêncio e cancelamento — não são falha.
      if (e.error !== 'no-speech' && e.error !== 'aborted') {
        erro.current?.(
          e.error === 'not-allowed'
            ? 'O navegador bloqueou o microfone. Use o microfone do teclado.'
            : 'O ditado falhou aqui. Use o microfone do teclado ou digite.',
        );
      }
    };
    r.onend = () => {
      sessao.current = null;
      setOuvindo(false);
    };

    sessao.current = r;
    setOuvindo(true);
    r.start();
  }, []);

  return { disponivel, ouvindo, alternar };
}
