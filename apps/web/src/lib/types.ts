export type IntensidadeAlarme = 'SILENCIOSO' | 'NOTIFICACAO' | 'ALARME';

export type StatusOcorrencia = 'AGENDADA' | 'DADA' | 'CANCELADA' | 'FERIADO' | 'REMARCADA';

export type Frequencia = 'SEMANAL' | 'QUINZENAL' | 'MENSAL' | 'PONTUAL';

export type TipoNotificacao =
  | 'ABERTURA_AULA'
  | 'FECHAMENTO_AULA'
  | 'SEM_REGISTRO'
  | 'GERAL';

export interface Perfil {
  id: string;
  nome: string;
  email: string;
  timezone: string;
  antecedenciaPadraoMin: number;
  atrasoPadraoMin: number;
  intensidadeAberturaPadrao: IntensidadeAlarme;
  intensidadeFechamentoPadrao: IntensidadeAlarme;
  somPadrao: boolean;
  vibraPadrao: boolean;
}

export interface Cadeira {
  id: string;
  disciplina: string;
  turma: string;
  anoLetivo: number;
  corHex: string;
  ativo: boolean;
  escola?: { id: string; nome: string } | null;
  _count?: { series: number; unidades: number };
}

export interface AlarmeResolvido {
  antecedenciaMin: number;
  atrasoMin: number;
  intensidadeAbertura: IntensidadeAlarme;
  intensidadeFechamento: IntensidadeAlarme;
  som: boolean;
  vibra: boolean;
}

export interface ConfigAlarmeResposta {
  efetiva: AlarmeResolvido;
  override: Partial<AlarmeResolvido> | null;
  padroesDaConta: AlarmeResolvido;
}

export interface Ocorrencia {
  id: string;
  data: string;
  horaInicio: string;
  horaFim: string;
  inicioEm: string;
  fimEm: string;
  status: StatusOcorrencia;
  observacao: string | null;
  cadeira: { id: string; disciplina: string; turma: string; corHex: string };
  registro: { id: string; planoPrevisto: string | null; conteudoDado: string | null } | null;
}

export interface Notificacao {
  id: string;
  tipo: TipoNotificacao;
  titulo: string;
  corpo: string;
  url: string | null;
  lida: boolean;
  criadoEm: string;
}
