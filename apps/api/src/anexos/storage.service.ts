import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export const BUCKET = 'anexos';

/**
 * Cliente fino do Supabase Storage via REST.
 *
 * Sem SDK, pelo mesmo motivo do AuthService: são três operações e o SDK traria
 * um cliente com estado e cache que não fazem sentido no servidor.
 *
 * A chave de SERVIÇO fica só aqui. É ela que dá acesso irrestrito ao Storage —
 * nunca pode ir para o navegador, e é por isso que o upload passa pela API em
 * vez de o front falar direto com o Supabase.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  constructor(private readonly config: ConfigService) {}

  /** Sem chave configurada, o recurso fica inativo em vez de derrubar o boot. */
  get ativo(): boolean {
    return Boolean(this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY'));
  }

  private get credenciais() {
    const url = this.config.get<string>('SUPABASE_URL');
    const chave = this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !chave) {
      throw new InternalServerErrorException(
        'Anexos indisponíveis: SUPABASE_SERVICE_ROLE_KEY não configurada.',
      );
    }
    return { base: `${url}/storage/v1`, chave };
  }

  private cabecalhos(extra: Record<string, string> = {}) {
    const { chave } = this.credenciais;
    return { Authorization: `Bearer ${chave}`, apikey: chave, ...extra };
  }

  async enviar(caminho: string, conteudo: Buffer, contentType: string): Promise<void> {
    const { base } = this.credenciais;
    const r = await fetch(`${base}/object/${BUCKET}/${encodeURI(caminho)}`, {
      method: 'POST',
      headers: this.cabecalhos({ 'Content-Type': contentType }),
      body: new Uint8Array(conteudo),
    });
    if (!r.ok) {
      const corpo = await r.text().catch(() => '');
      this.logger.error(`Falha ao subir ${caminho}: ${r.status} ${corpo}`);
      throw new InternalServerErrorException('Não foi possível enviar o arquivo.');
    }
  }

  /**
   * URL temporária de leitura.
   *
   * O bucket é privado de propósito: anexo de aula pode conter foto de caderno
   * com nome de aluno na capa. URL pública seria um endereço eterno e
   * adivinhável para esse material.
   */
  async urlAssinada(caminho: string, segundos = 3600): Promise<string> {
    const { base } = this.credenciais;
    const r = await fetch(`${base}/object/sign/${BUCKET}/${encodeURI(caminho)}`, {
      method: 'POST',
      headers: this.cabecalhos({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ expiresIn: segundos }),
    });
    if (!r.ok) throw new InternalServerErrorException('Não foi possível abrir o arquivo.');
    const json = (await r.json()) as { signedURL: string };
    // A API devolve caminho relativo a /storage/v1.
    return `${base}${json.signedURL.replace(/^\/?/, '/')}`;
  }

  /**
   * Traz o objeto de volta para o servidor.
   *
   * Existe para a importação do plano: o PDF precisa ser lido aqui dentro, e
   * baixá-lo pela URL assinada seria dar a volta pela internet pública para
   * buscar um arquivo que a chave de serviço alcança direto.
   */
  async baixar(caminho: string): Promise<Buffer> {
    const { base } = this.credenciais;
    const r = await fetch(`${base}/object/${BUCKET}/${encodeURI(caminho)}`, {
      headers: this.cabecalhos(),
    });
    if (!r.ok) {
      this.logger.error(`Falha ao baixar ${caminho}: ${r.status}`);
      throw new InternalServerErrorException('Não foi possível abrir o arquivo.');
    }
    return Buffer.from(await r.arrayBuffer());
  }

  /**
   * Não lança quando falha: quem chama já apagou (ou vai apagar) a linha do
   * banco, e um objeto órfão no Storage é bem menos ruim do que uma linha
   * fantasma que a tela mostra e ninguém consegue abrir.
   */
  async remover(caminho: string): Promise<void> {
    const { base } = this.credenciais;
    const r = await fetch(`${base}/object/${BUCKET}/${encodeURI(caminho)}`, {
      method: 'DELETE',
      headers: this.cabecalhos(),
    });
    if (!r.ok) this.logger.warn(`Objeto não removido do Storage: ${caminho} (${r.status})`);
  }
}
