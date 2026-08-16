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
  ): Promise<{ unidades: UnidadeExtraida[]; paginas: number }> {
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
    const { texto, paginas, pareceEscaneado } = await extrairTextoDePdf(arquivo);

    // PDF escaneado tem a mesma extensão e a mesma cara na tela, e camada de
    // texto vazia. Mandá-la ao modelo produziria unidades inventadas a partir
    // do nada — pior desfecho possível para um documento que vira currículo.
    if (pareceEscaneado) {
      throw new BadRequestException(
        'Este PDF é imagem — não tem texto para ler. Ele continua guardado aqui, e as unidades você cadastra na mão.',
      );
    }

    const bruto = await this.chamar(professorId, planoCurricularId, texto);
    return { unidades: aplicarPlano(bruto), paginas };
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
