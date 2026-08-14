import { IntensidadeAlarme } from '@prisma/client';

/** Os padrões da conta, que moram no `Professor`. */
export interface PadroesProfessor {
  antecedenciaPadraoMin: number;
  atrasoPadraoMin: number;
  intensidadeAberturaPadrao: IntensidadeAlarme;
  intensidadeFechamentoPadrao: IntensidadeAlarme;
  somPadrao: boolean;
  vibraPadrao: boolean;
}

/** O override por cadeira. Todo campo é opcional — nulo herda o padrão. */
export interface OverrideCadeira {
  antecedenciaMin: number | null;
  atrasoMin: number | null;
  intensidadeAbertura: IntensidadeAlarme | null;
  intensidadeFechamento: IntensidadeAlarme | null;
  som: boolean | null;
  vibra: boolean | null;
}

export interface AlarmeResolvido {
  antecedenciaMin: number;
  atrasoMin: number;
  intensidadeAbertura: IntensidadeAlarme;
  intensidadeFechamento: IntensidadeAlarme;
  som: boolean;
  vibra: boolean;
}

/**
 * Combina os padrões da conta com o override da cadeira.
 *
 * Função pura de propósito: é a única lógica da fase com ramificação de
 * verdade, e testá-la sem banco custa nada. O contrato é campo a campo — nulo
 * herda, valor manda —, e não "se existe override, usa ele inteiro". A
 * diferença importa: a professora que só quer mais antecedência no primeiro
 * horário não deveria ter de reconfigurar som e vibração junto.
 *
 * `false` e `0` são valores legítimos, então a checagem é contra `null`/
 * `undefined` — um `??` ingênuo com `||` faria "sem vibração" virar "vibração
 * padrão", que é o oposto do pedido.
 */
export function resolverAlarme(
  padroes: PadroesProfessor,
  override: OverrideCadeira | null | undefined,
): AlarmeResolvido {
  const usar = <T>(doOverride: T | null | undefined, oPadrao: T): T =>
    doOverride === null || doOverride === undefined ? oPadrao : doOverride;

  return {
    antecedenciaMin: usar(override?.antecedenciaMin, padroes.antecedenciaPadraoMin),
    atrasoMin: usar(override?.atrasoMin, padroes.atrasoPadraoMin),
    intensidadeAbertura: usar(override?.intensidadeAbertura, padroes.intensidadeAberturaPadrao),
    intensidadeFechamento: usar(
      override?.intensidadeFechamento,
      padroes.intensidadeFechamentoPadrao,
    ),
    som: usar(override?.som, padroes.somPadrao),
    vibra: usar(override?.vibra, padroes.vibraPadrao),
  };
}
