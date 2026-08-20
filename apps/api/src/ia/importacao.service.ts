import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { StorageService } from '../anexos/storage.service';
import { ErrosService } from '../common/erros.service';
import { PrismaService } from '../prisma/prisma.service';
import { ModeloService } from './modelo.service';
import { extrairTextoDePdf } from './pdf';
import {
  aplicarPlano,
  ESQUEMA_PLANO,
  montarPromptPlano,
  SISTEMA_PLANO,
  type PlanoBruto,
  type UnidadeExtraida,
} from './plano.prompt';
import { lerPlanoUnifor } from './unifor';
import { estimarCronograma } from '../planos/cronograma';

/**
 * Uma unidade proposta, com o que o formato da Unifor sabe a mais.
 *
 * Os campos extras são opcionais porque o caminho do modelo não os produz: ele
 * lê documento de formato livre, onde não há carga horária declarada nem
 * calendário. A tela desenha o que vier.
 */
export interface UnidadeProposta extends UnidadeExtraida {
  cargaHoraria?: number;
  dataInicio?: string;
  dataFimPrevista?: string;
  /** Quantas aulas a estimativa reservou para esta unidade. */
  aulas?: number;
}

export interface PropostaDeImportacao {
  /** `unifor` = lido por parser, sem modelo nenhum. Muda o que a tela oferece. */
  origem: 'unifor' | 'modelo';
  paginas: number;
  unidades: UnidadeProposta[];
  /** A grade que o documento descreve. Null quando não dá para saber. */
  grade: { diaSemana: number; horaInicio: string; horaFim: string }[] | null;
  /** As datas de aula do cronograma, "YYYY-MM-DD". */
  encontros: string[];
  identificacao: {
    disciplina: string | null;
    codigoTurma: string | null;
    ano: number | null;
    semestre: number | null;
  } | null;
}

/**
 * Lê o plano de curso escrito dela e devolve a estrutura como **rascunho**.
 *
 * Não grava nada. Quem cria unidade e tópico é ela, confirmando na tela — e a
 * regra vale dobrado aqui: um plano importado com a unidade 3 errada contamina
 * todo registro que apontar para ela, e o erro só aparece meses depois, quando
 * ela for olhar o progresso da turma.
 *
 * Trabalha em cima do anexo que ela já subiu, e não de um upload novo: o
 * documento fica guardado de qualquer jeito (é o que ela consulta enquanto
 * confere), então pedir o arquivo duas vezes seria pedir duas vezes.
 */
@Injectable()
export class ImportacaoService {
  private readonly logger = new Logger(ImportacaoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly modelo: ModeloService,
    private readonly erros: ErrosService,
  ) {}

  async extrair(
    professorId: string,
    planoCurricularId: string,
    anexoId: string,
  ): Promise<PropostaDeImportacao> {
    if (!this.modelo.ativo) {
      throw new ServiceUnavailableException(
        'Importação indisponível: nenhum provedor de IA configurado.',
      );
    }
    if (!this.storage.ativo) {
      throw new ServiceUnavailableException(
        'Importação indisponível: falta configurar a chave de serviço do Storage.',
      );
    }

    // Filtra pelos dois: sem `planoCurricularId` no where, o anexo de um plano
    // serviria para importar em outro — e sem `professorId`, o de outra conta.
    const anexo = await this.prisma.anexo.findFirst({
      where: { id: anexoId, professorId, planoCurricularId },
      select: { storagePath: true, nomeArquivo: true },
    });
    if (!anexo) throw new NotFoundException('Documento não encontrado neste plano.');

    if (!anexo.nomeArquivo.toLowerCase().endsWith('.pdf')) {
      throw new BadRequestException(
        'Só dá para ler PDF por enquanto. A foto continua guardada aqui para você consultar.',
      );
    }

    const arquivo = await this.storage.baixar(anexo.storagePath);
    const { texto, textoCompleto, paginas, pareceEscaneado } = await extrairTextoDePdf(arquivo);

    // PDF escaneado tem a mesma extensão e a mesma cara na tela, e camada de
    // texto vazia. Mandá-la ao modelo produziria unidades inventadas a partir
    // do nada — pior desfecho possível para um documento que vira currículo.
    if (pareceEscaneado) {
      throw new BadRequestException(
        'Este PDF é imagem — não tem texto para ler. Ele continua guardado aqui, e as unidades você cadastra na mão.',
      );
    }

    // O formato da Unifor primeiro, e sem gastar chamada: ele traz carga
    // horária e calendário, que o modelo não tem como devolver porque o schema
    // do prompt só pede unidades e tópicos. Não reconhecendo, cai no caminho
    // de sempre, que lê documento de formato livre.
    const daUnifor = this.lerUnifor(textoCompleto, paginas);
    if (daUnifor) return daUnifor;

    const bruto = await this.chamar(professorId, planoCurricularId, texto);
    return {
      origem: 'modelo',
      paginas,
      unidades: aplicarPlano(bruto),
      grade: null,
      encontros: [],
      identificacao: null,
    };
  }

  /**
   * O caminho determinístico.
   *
   * As datas do cronograma entram como CALENDÁRIO, não como conteúdo: o que cai
   * em cada aula é estimado pelas horas-aula (`planos/cronograma.ts`), porque o
   * pareamento data → tópico daquela tabela não é recuperável. A razão inteira
   * está em `unifor.ts`, e há um teste travando a decisão.
   */
  private lerUnifor(texto: string, paginas: number): PropostaDeImportacao | null {
    const plano = lerPlanoUnifor(texto);
    if (!plano) return null;

    const estimado = new Map(
      estimarCronograma(plano.unidades, plano.encontros).map((e) => [e.ordem, e]),
    );

    return {
      origem: 'unifor',
      paginas,
      unidades: plano.unidades.map((u) => {
        const periodo = estimado.get(u.ordem);
        return {
          titulo: u.titulo,
          topicos: u.topicos,
          ...(u.cargaHoraria !== null && { cargaHoraria: u.cargaHoraria }),
          ...(periodo && {
            dataInicio: periodo.dataInicio,
            dataFimPrevista: periodo.dataFimPrevista,
            aulas: periodo.aulas,
          }),
        };
      }),
      grade: plano.horarios.length
        ? plano.horarios.map(({ diaSemana, horaInicio, horaFim }) => ({
            diaSemana,
            horaInicio,
            horaFim,
          }))
        : null,
      encontros: plano.encontros,
      identificacao: {
        disciplina: plano.disciplina,
        codigoTurma: plano.codigoTurma,
        ano: plano.ano,
        semestre: plano.semestre,
      },
    };
  }

  private async chamar(
    professorId: string,
    planoCurricularId: string,
    texto: string,
  ): Promise<PlanoBruto> {
    try {
      const json = await this.modelo.pedirJson({
        sistema: SISTEMA_PLANO,
        prompt: montarPromptPlano(texto),
        esquema: ESQUEMA_PLANO,
        nome: 'plano_de_curso',
        erroDeTamanho: 'O documento é longo demais. Importe uma parte por vez.',
      });
      return JSON.parse(json) as PlanoBruto;
    } catch (e) {
      if (e instanceof BadGatewayException) throw e;

      const mensagem = e instanceof Error ? e.message : String(e);
      this.logger.error(`Importação falhou para o plano ${planoCurricularId}: ${mensagem}`);
      await this.erros.registrar(
        `ImportacaoService:${this.modelo.provedorAtual}`,
        'POST',
        `/planos/${planoCurricularId}/importar`,
        professorId,
        mensagem,
        e instanceof Error ? e.stack : undefined,
      );
      throw new BadGatewayException(
        'Não foi possível ler o documento agora. Ele continua guardado aqui.',
      );
    }
  }
}
