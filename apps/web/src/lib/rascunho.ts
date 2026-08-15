import type { RegistroAula } from './types';

/** O rascunho da IA, do jeito que o servidor guardou em `resumoPadronizado`. */
export interface RascunhoIA {
  conteudoDado: string;
  unidadeId: string | null;
  topicosCobertos: string[];
  atividadeCasa: string;
  dataEntrega: string;
  planoProximaAula: string;
}

/** Os seis campos do formulário de fechamento, prontos para o `useState`. */
export interface ValoresFechamento {
  conteudo: string;
  unidadeId: string;
  topicos: string[];
  atividade: string;
  entrega: string;
  proxima: string;
}

/**
 * O rascunho ainda não conferido deste registro, ou null.
 *
 * `revisadoEm` preenchido significa que ela leu e salvou: o que vale dali em
 * diante são os campos do registro. Devolver o rascunho aqui reescreveria por
 * cima da correção que ela fez — que é justamente a razão de ele existir.
 */
export function rascunhoPendente(registro: RegistroAula | null): RascunhoIA | null {
  if (!registro || registro.revisadoEm || !registro.resumoPadronizado) return null;

  try {
    const bruto = JSON.parse(registro.resumoPadronizado) as Partial<RascunhoIA>;
    return {
      conteudoDado: bruto.conteudoDado ?? '',
      unidadeId: bruto.unidadeId ?? null,
      topicosCobertos: Array.isArray(bruto.topicosCobertos) ? bruto.topicosCobertos : [],
      atividadeCasa: bruto.atividadeCasa ?? '',
      dataEntrega: bruto.dataEntrega ?? '',
      planoProximaAula: bruto.planoProximaAula ?? '',
    };
  } catch {
    // Rascunho ilegível não pode travar a tela: ela cai no formulário em
    // branco e digita, que é o caminho que sempre existiu.
    return null;
  }
}

export function valoresDoRascunho(rascunho: RascunhoIA): ValoresFechamento {
  return {
    conteudo: rascunho.conteudoDado,
    unidadeId: rascunho.unidadeId ?? '',
    topicos: rascunho.topicosCobertos,
    atividade: rascunho.atividadeCasa,
    entrega: rascunho.dataEntrega,
    proxima: rascunho.planoProximaAula,
  };
}

/**
 * Com o que o formulário de fechamento abre.
 *
 * Rascunho pendente ganha de tudo, e por inteiro: o servidor zera `revisadoEm`
 * ao gerar justamente para dizer "o que está aqui agora é do modelo". Misturar
 * campo a campo faria o texto antigo dela sobreviver ao lado do resumo novo,
 * e ela salvaria uma colcha que não conferiu.
 */
export function valoresIniciais(
  registro: RegistroAula | null,
  /** Unidade da turma irmã. Primitivo, e não o objeto: entra em dependência de
   *  efeito, e um objeto novo a cada refetch apagaria o que ela está digitando. */
  unidadeDaIrma: string | null | undefined,
): ValoresFechamento {
  const rascunho = rascunhoPendente(registro);
  if (rascunho) return valoresDoRascunho(rascunho);

  return {
    conteudo: registro?.conteudoDado ?? '',
    unidadeId: registro?.unidadeId ?? unidadeDaIrma ?? '',
    topicos: registro?.topicos.map((t) => t.topicoId) ?? [],
    atividade: registro?.atividadeCasa ?? '',
    entrega: registro?.dataEntrega?.slice(0, 10) ?? '',
    proxima: registro?.planoProximaAula ?? '',
  };
}
