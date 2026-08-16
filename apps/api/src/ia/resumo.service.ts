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
  escolherProvedor,
  GROQ_BASE,
  MODELO_ANTHROPIC,
  MODELO_GROQ,
  type Provedor,
} from './provedor';
import {
  aplicarResumo,
  ESQUEMA,
  montarPrompt,
  SISTEMA,
  type ResumoBruto,
  type UnidadeContexto,
} from './resumo.prompt';

/** A saída são seis campos curtos. Teto generoso para isso, e nada além. */
const MAX_TOKENS = 2048;

/**
 * Ela está na sala, no celular, entre uma aula e outra. O padrão do SDK da
 * Anthropic é 10 minutos de espera — desistir rápido e deixá-la digitar é
 * melhor desfecho que uma tela girando até o intervalo acabar.
 */
const TIMEOUT_MS = 45_000;

@Injectable()
export class ResumoService {
  private readonly logger = new Logger(ResumoService.name);
  private readonly provedor: Provedor | null;
  private readonly anthropic: Anthropic | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly erros: ErrosService,
    private readonly config: ConfigService,
  ) {
    this.provedor = escolherProvedor({
      IA_PROVEDOR: config.get<string>('IA_PROVEDOR'),
      ANTHROPIC_API_KEY: config.get<string>('ANTHROPIC_API_KEY'),
      GROQ_API_KEY: config.get<string>('GROQ_API_KEY'),
    });

    // A chave fica só aqui, como a de serviço do Storage: é o motivo de a
    // normalização rodar no NestJS em vez de o front chamar o provedor.
    this.anthropic =
      this.provedor === 'anthropic'
        ? new Anthropic({
            apiKey: config.get<string>('ANTHROPIC_API_KEY')!,
            timeout: TIMEOUT_MS,
            maxRetries: 1,
          })
        : null;

    if (this.provedor) this.logger.log(`Resumo por voz ativo via ${this.provedor}.`);
  }

  /** Sem provedor configurado o recurso fica inativo, sem derrubar o boot. */
  get ativo(): boolean {
    return this.provedor !== null;
  }

  get provedorAtual(): Provedor | null {
    return this.provedor;
  }

  async gerar(professorId: string, ocorrenciaId: string, transcricao: string) {
    if (!this.provedor) {
      throw new ServiceUnavailableException(
        'Resumo por voz indisponível: nenhum provedor de IA configurado.',
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

    return { rascunho, transcricao, provedor: this.provedor };
  }

  private async chamar(
    professorId: string,
    ocorrenciaId: string,
    prompt: string,
  ): Promise<ResumoBruto> {
    try {
      const json =
        this.provedor === 'groq' ? await this.viaGroq(prompt) : await this.viaAnthropic(prompt);
      return JSON.parse(json) as ResumoBruto;
    } catch (e) {
      if (e instanceof BadGatewayException) throw e;

      const mensagem = e instanceof Error ? e.message : String(e);
      this.logger.error(`Resumo falhou para ocorrência ${ocorrenciaId}: ${mensagem}`);
      await this.erros.registrar(
        `ResumoService:${this.provedor}`,
        'POST',
        `/ia/ocorrencia/${ocorrenciaId}/resumo`,
        professorId,
        mensagem,
        e instanceof Error ? e.stack : undefined,
      );
      throw new BadGatewayException('Não foi possível gerar o resumo agora. O texto continua seu.');
    }
  }

  private async viaAnthropic(prompt: string): Promise<string> {
    // Sem `thinking` (neste modelo omitir já desliga) e sem `effort`, que
    // `claude-haiku-4-5` recusa: isto é extração com schema, não raciocínio.
    const resposta = await this.anthropic!.messages.create({
      model: MODELO_ANTHROPIC,
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

    const texto = resposta.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text;
    if (!texto) throw new BadGatewayException('O modelo não devolveu resumo.');
    return texto;
  }

  /**
   * Groq via REST, sem SDK — mesmo critério do StorageService e do AuthService:
   * é uma chamada só, e a API é compatível com a da OpenAI.
   *
   * `strict: true` é o que faz valer a pena: o mesmo `ESQUEMA` que a Anthropic
   * recebe vira decodificação restrita aqui, então campo faltando não existe.
   * Ele já nasceu compatível (todo campo obrigatório, `additionalProperties`
   * falso), que são exatamente as exigências do modo estrito.
   */
  private async viaGroq(prompt: string): Promise<string> {
    const chave = this.config.get<string>('GROQ_API_KEY');
    const r = await fetch(`${GROQ_BASE}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODELO_GROQ,
        messages: [
          { role: 'system', content: SISTEMA },
          { role: 'user', content: prompt },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'resumo_da_aula', strict: true, schema: ESQUEMA },
        },
        max_completion_tokens: MAX_TOKENS,
        // Extração não quer criatividade: a mesma fala tem de dar o mesmo
        // registro se ela ditar de novo.
        temperature: 0,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!r.ok) {
      const corpo = await r.text().catch(() => '');
      throw new Error(`Groq respondeu ${r.status}: ${corpo.slice(0, 300)}`);
    }

    const dados = (await r.json()) as {
      choices?: { finish_reason?: string; message?: { content?: string } }[];
    };
    const escolha = dados.choices?.[0];

    if (escolha?.finish_reason === 'length') {
      throw new BadGatewayException('A fala ficou longa demais para resumir. Tente em partes.');
    }
    const texto = escolha?.message?.content;
    if (!texto) throw new BadGatewayException('O modelo não devolveu resumo.');
    return texto;
  }
}
