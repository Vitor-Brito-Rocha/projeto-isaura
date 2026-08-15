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
  planoCurricularId?: string | null;
  plano?: { id: string; nome: string; _count?: { unidades: number } } | null;
  _count?: { series: number };
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

export interface Topico {
  id: string;
  ordem: number;
  titulo: string;
}

export interface Unidade {
  id: string;
  ordem: number;
  titulo: string;
  dataInicio: string | null;
  dataFimPrevista: string | null;
  topicos: Topico[];
}

export interface PlanoCurricular {
  id: string;
  nome: string;
  disciplina: string | null;
  anoLetivo: number;
  _count?: { unidades: number; cadeiras: number };
}

/** Resposta de `GET /planos/:id`. */
export interface PlanoDetalhe extends PlanoCurricular {
  unidades: Unidade[];
  cadeiras: { id: string; disciplina: string; turma: string; corHex: string }[];
}

export interface Anexo {
  id: string;
  tipo: 'FOTO' | 'DOCUMENTO' | 'AUDIO';
  nomeArquivo: string;
  tamanhoBytes: number | null;
  criadoEm: string;
  /** Assinada na leitura e temporária — o bucket é privado. */
  url: string | null;
}

export interface RegistroAula {
  id: string;
  planoPrevisto: string | null;
  conteudoDado: string | null;
  unidadeId: string | null;
  atividadeCasa: string | null;
  dataEntrega: string | null;
  planoProximaAula: string | null;
  /** A fala original. Existe só até `revisadoEm`; depois o servidor a apaga. */
  transcricaoBruta: string | null;
  /** JSON do último rascunho da IA. Ver `lib/rascunho.ts`. */
  resumoPadronizado: string | null;
  /** null = ainda é rascunho e não conta como registro. */
  revisadoEm: string | null;
  topicos: { registroId: string; topicoId: string }[];
}

/** Resposta de `GET /registros/ocorrencia/:id` — tudo que a tela precisa. */
export interface ContextoAula {
  ocorrencia: Ocorrencia & {
    cadeira: Cadeira & { planoCurricularId: string | null };
  };
  registro: RegistroAula | null;
  unidades: Unidade[];
  /** As próximas aulas desta turma — atalhos para a data de entrega. */
  proximasAulas: { id: string; data: string; horaInicio: string }[];
  sugestoes: {
    daAulaAnterior: { data: string; texto: string } | null;
    daTurmaIrma: {
      turma: string;
      data: string;
      texto: string;
      unidadeId: string | null;
    } | null;
  };
}

// ---- Admin (só para quem passa no AdminGuard da API) ----

export interface AdminResumo {
  professores: { total: number; novos30: number; ativos7d: number; comDevice: number };
  aulas: {
    cadeirasAtivas: number;
    agendadas: number;
    jaAconteceram: number;
    registradas: number;
    /** null quando ainda não houve aula — evita dividir por zero na tela. */
    taxaRegistro: number | null;
  };
  erros: { ultimas24h: number; ultimos7d: number };
}

export interface AdminProfessor {
  id: string;
  nome: string;
  email: string;
  timezone: string;
  criadoEm: string;
  cadeiras: number;
  ocorrencias: number;
  devices: number;
  registros: number;
  ultimoRegistroEm: string | null;
}

export interface ErroLog {
  id: string;
  criadoEm: string;
  origem: string;
  metodo: string;
  rota: string;
  professorId: string | null;
  mensagem: string;
}

/** A stack só vem no detalhe: na lista ela estouraria a resposta. */
export interface ErroLogDetalhe extends ErroLog {
  stack: string | null;
}

export interface Pagina<T> {
  total: number;
  pagina: number;
  tamanho: number;
  itens: T[];
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
