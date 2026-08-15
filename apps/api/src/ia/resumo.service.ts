import Anthropic from '@anthropic-ai/sdk';
import {
  BadGatewayException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrosService } from '../common/erros.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  aplicarResumo,
  ESQUEMA,
  montarPrompt,
  SISTEMA,
  type ResumoBruto,
  type UnidadeContexto,
} from './resumo.prompt';

/**
 * O modelo pequeno basta porque o schema já garante os campos e a saída passa
 * por revisão humana antes de virar registro.
 *
 * O critério de upgrade está no PLANO e é medido, não preventivo: se em 5 falas
 * reais dela o resumo errar a resolução de referência ou a associação com a
 * unidade, subir para `claude-sonnet-5`. É trocar esta string.
 */
const MODELO = 'claude-haiku-4-5';

/** A saída são seis campos curtos. Teto generoso para isso, e nada além. */
const MAX_TOKENS = 2048;

/**
 * Ela está na sala, no celular, entre uma aula e outra. O padrão do SDK é 10
 * minutos de espera — desistir rápido e deixá-la digitar é melhor desfecho que
 * uma tela girando até o intervalo acabar.
 */
const TIMEOUT_MS = 45_000;

@Injectable()
export class ResumoService {
  private readonly logger = new Logger(ResumoService.name);
  private readonly cliente: Anthropic | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly erros: ErrosService,
    config: ConfigService,
  ) {
    // A chave fica só aqui, como a de serviço do Storage: é o motivo de a
    // normalização rodar no NestJS em vez de o front chamar a Anthropic.
    const chave = config.get<string>('ANTHROPIC_API_KEY');
    this.cliente = chave
      ? new Anthropic({ apiKey: chave, timeout: TIMEOUT_MS, maxRetries: 1 })
      : null;
  }

  /** Sem chave configurada o recurso fica inativo, em vez de derrubar o boot. */
  get ativo(): boolean {
    return this.cliente !== null;
  }

  async gerar(professorId: string, ocorrenciaId: string, transcricao: string) {
    if (!this.cliente) {
      throw new ServiceUnavailableException(
        'Resumo por voz indisponível: falta configurar a chave da Anthropic.',
      );
    }

    const ocorrencia = await this.prisma.ocorrencia.findFirst({
      where: { id: ocorrenciaId, professorId },
      include: {
        cadeira: {
          include: {
            plano: {
              include: {
                unidades: {
                  orderBy: { ordem: 'asc' },
                  include: { topicos: { orderBy: { ordem: 'asc' } } },
                },
              },
            },
          },
        },
        registro: { select: { planoPrevisto: true } },
      },
    });
    if (!ocorrencia) throw new NotFoundException('Aula não encontrada.');

    const unidades: UnidadeContexto[] = (ocorrencia.cadeira.plano?.unidades ?? []).map((u) => ({
      id: u.id,
      titulo: u.titulo,
      topicos: u.topicos.map((t) => ({ id: t.id, titulo: t.titulo })),
    }));

    const prompt = montarPrompt(
      {
        disciplina: ocorrencia.cadeira.disciplina,
        turma: ocorrencia.cadeira.turma,
        anoLetivo: ocorrencia.cadeira.anoLetivo,
        data: ocorrencia.data,
        horaInicio: ocorrencia.horaInicio,
        horaFim: ocorrencia.horaFim,
        planoPrevisto: ocorrencia.registro?.planoPrevisto ?? null,
        unidades,
      },
      transcricao,
    );

    const bruto = await this.chamar(professorId, ocorrenciaId, prompt);
    const rascunho = aplicarResumo(bruto, unidades);

    // Grava como RASCUNHO: a fala original e a saída da IA entram no registro,
    // mas nenhum campo do fechamento é escrito e `revisadoEm` continua nulo.
    // Quem promove isto a registro é ela, salvando o formulário.
    await this.prisma.registroAula.upsert({
      where: { ocorrenciaId },
      create: {
        professorId,
        ocorrenciaId,
        transcricaoBruta: transcricao,
        resumoPadronizado: JSON.stringify(rascunho),
      },
      update: {
        transcricaoBruta: transcricao,
        resumoPadronizado: JSON.stringify(rascunho),
        // Ditar de novo desfaz a revisão anterior: o que está na tela voltou a
        // ser saída de modelo, e não pode continuar contando como conferido.
        revisadoEm: null,
      },
      select: { id: true },
    });

    return { rascunho, transcricao };
  }

  private async chamar(
    professorId: string,
    ocorrenciaId: string,
    prompt: string,
  ): Promise<ResumoBruto> {
    try {
      // Sem `thinking` (neste modelo omitir já desliga) e sem `effort`, que
      // `claude-haiku-4-5` recusa: isto é extração com schema, não raciocínio.
      const resposta = await this.cliente!.messages.create({
        model: MODELO,
        max_tokens: MAX_TOKENS,
        system: SISTEMA,
        messages: [{ role: 'user', content: prompt }],
        output_config: { format: { type: 'json_schema', schema: ESQUEMA } },
      });

      if (resposta.stop_reason === 'refusal') {
        throw new BadGatewayException('O modelo recusou esta fala. Registre no texto, por favor.');
      }
      if (resposta.stop_reason === 'max_tokens') {
        throw new BadGatewayException('A fala ficou longa demais para resumir. Tente em partes.');
      }

      const texto = resposta.content.find(
        (b): b is Anthropic.TextBlock => b.type === 'text',
      )?.text;
      if (!texto) throw new BadGatewayException('O modelo não devolveu resumo.');

      return JSON.parse(texto) as ResumoBruto;
    } catch (e) {
      if (e instanceof BadGatewayException) throw e;

      const mensagem = e instanceof Error ? e.message : String(e);
      this.logger.error(`Resumo falhou para ocorrência ${ocorrenciaId}: ${mensagem}`);
      await this.erros.registrar(
        'ResumoService',
        'POST',
        `/ia/ocorrencia/${ocorrenciaId}/resumo`,
        professorId,
        mensagem,
        e instanceof Error ? e.stack : undefined,
      );
      throw new BadGatewayException('Não foi possível gerar o resumo agora. O texto continua seu.');
    }
  }
}
