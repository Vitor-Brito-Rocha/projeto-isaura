import Anthropic from '@anthropic-ai/sdk';
import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  escolherProvedor,
  GROQ_BASE,
  MODELO_ANTHROPIC,
  MODELO_GROQ,
  type Provedor,
} from './provedor';

/**
 * O transporte até o modelo, e só isso.
 *
 * Existe porque dois caminhos precisam da mesma chamada com schema — o resumo da
 * fala e a extração do plano de curso — e a diferença entre eles é o prompt, não
 * o encanamento. Duplicar `viaGroq` seria duplicar junto o retry estrito→frouxo
 * e o timeout, que são exatamente as partes difíceis de acertar duas vezes.
 *
 * **A chave de terceiro mora aqui e não sai.** É o motivo de a normalização
 * rodar no NestJS em vez de o front falar com o provedor.
 */

/** As saídas são JSON curto. Teto generoso para isso, e nada além. */
const MAX_TOKENS = 4096;

/**
 * Ela está na sala, no celular, entre uma aula e outra. O padrão do SDK da
 * Anthropic é 10 minutos de espera — desistir rápido e deixá-la digitar é
 * melhor desfecho que uma tela girando até o intervalo acabar.
 */
const TIMEOUT_MS = 45_000;

export interface PedidoAoModelo {
  /** Prompt de sistema — o que muda entre resumo e importação. */
  sistema: string;
  prompt: string;
  esquema: Record<string, unknown>;
  /** Nome do schema para a Groq; só aparece em log do provedor. */
  nome: string;
  /** Mensagem de erro quando a saída não coube no teto de tokens. */
  erroDeTamanho: string;
}

@Injectable()
export class ModeloService {
  private readonly logger = new Logger(ModeloService.name);
  private readonly provedor: Provedor | null;
  private readonly anthropic: Anthropic | null;

  constructor(private readonly config: ConfigService) {
    this.provedor = escolherProvedor({
      IA_PROVEDOR: config.get<string>('IA_PROVEDOR'),
      ANTHROPIC_API_KEY: config.get<string>('ANTHROPIC_API_KEY'),
      GROQ_API_KEY: config.get<string>('GROQ_API_KEY'),
    });

    this.anthropic =
      this.provedor === 'anthropic'
        ? new Anthropic({
            apiKey: config.get<string>('ANTHROPIC_API_KEY')!,
            timeout: TIMEOUT_MS,
            maxRetries: 1,
          })
        : null;

    if (this.provedor) this.logger.log(`IA ativa via ${this.provedor}.`);
  }

  /** Sem provedor configurado o recurso fica inativo, sem derrubar o boot. */
  get ativo(): boolean {
    return this.provedor !== null;
  }

  get provedorAtual(): Provedor | null {
    return this.provedor;
  }

  /** Devolve o JSON cru. Quem sabe interpretá-lo é quem chamou. */
  async pedirJson(pedido: PedidoAoModelo): Promise<string> {
    return this.provedor === 'groq' ? this.viaGroq(pedido) : this.viaAnthropic(pedido);
  }

  private async viaAnthropic(pedido: PedidoAoModelo): Promise<string> {
    // Sem `thinking` (neste modelo omitir já desliga) e sem `effort`, que
    // `claude-haiku-4-5` recusa: isto é extração com schema, não raciocínio.
    const resposta = await this.anthropic!.messages.create({
      model: MODELO_ANTHROPIC,
      max_tokens: MAX_TOKENS,
      system: pedido.sistema,
      messages: [{ role: 'user', content: pedido.prompt }],
      output_config: { format: { type: 'json_schema', schema: pedido.esquema } },
    });

    if (resposta.stop_reason === 'refusal') {
      throw new BadGatewayException('O modelo recusou este conteúdo.');
    }
    if (resposta.stop_reason === 'max_tokens') {
      throw new BadGatewayException(pedido.erroDeTamanho);
    }

    const texto = resposta.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text;
    if (!texto) throw new BadGatewayException('O modelo não devolveu resposta.');
    return texto;
  }

  /**
   * Groq via REST, sem SDK — mesmo critério do StorageService e do AuthService:
   * é uma chamada só, e a API é compatível com a da OpenAI.
   *
   * `strict: true` é o que faz valer a pena: o mesmo schema que a Anthropic
   * recebe vira validação aqui. Os schemas já nascem compatíveis (todo campo
   * obrigatório, `additionalProperties` falso), que são as exigências do modo
   * estrito.
   */
  private async viaGroq(pedido: PedidoAoModelo): Promise<string> {
    const estrito = await this.pedirAGroq(pedido, true);
    if (estrito.ok) return estrito.texto;

    // `strict: true` na Groq VALIDA depois de gerar — não restringe a
    // decodificação. Medido: pedindo dois tópicos numerados, o modelo devolveu
    // `[12]` emendando os dígitos de 1 e 2, e a chamada inteira virou 400.
    //
    // Repetir sem o modo estrito troca "erro na cara dela" por "rascunho com um
    // campo a menos", e o saneamento de cada caminho já descarta o que não
    // existe. Para um rascunho que ela vai revisar de qualquer jeito, é o lado
    // certo de errar — e só custa uma segunda chamada quando a primeira falha.
    this.logger.warn(`Groq recusou o schema estrito, repetindo sem: ${estrito.erro}`);
    const frouxo = await this.pedirAGroq(pedido, false);
    if (!frouxo.ok) throw new Error(`Groq respondeu ${frouxo.erro}`);
    return frouxo.texto;
  }

  private async pedirAGroq(
    pedido: PedidoAoModelo,
    estrito: boolean,
  ): Promise<{ ok: true; texto: string } | { ok: false; erro: string }> {
    const chave = this.config.get<string>('GROQ_API_KEY');
    const r = await fetch(`${GROQ_BASE}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODELO_GROQ,
        messages: [
          { role: 'system', content: pedido.sistema },
          { role: 'user', content: pedido.prompt },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: pedido.nome, strict: estrito, schema: pedido.esquema },
        },
        max_completion_tokens: MAX_TOKENS,
        // Extração não quer criatividade: o mesmo documento tem de dar a mesma
        // estrutura se ela importar de novo.
        temperature: 0,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!r.ok) {
      const corpo = await r.text().catch(() => '');
      // 429 não é falha de schema: repetir sem o modo estrito só gasta a
      // segunda chamada e leva 429 de novo. O plano gratuito tem 8000 tokens
      // por minuto, e a mensagem tem de dizer que é para tentar de novo.
      if (r.status === 429) {
        throw new BadGatewayException(
          'O provedor de IA está no limite deste minuto. Tente de novo em instantes.',
        );
      }
      return { ok: false, erro: `${r.status}: ${corpo.slice(0, 300)}` };
    }

    const dados = (await r.json()) as {
      choices?: { finish_reason?: string; message?: { content?: string } }[];
    };
    const escolha = dados.choices?.[0];

    if (escolha?.finish_reason === 'length') {
      throw new BadGatewayException(pedido.erroDeTamanho);
    }
    const texto = escolha?.message?.content;
    if (!texto) throw new BadGatewayException('O modelo não devolveu resposta.');
    return { ok: true, texto };
  }
}
