import { Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SupabaseSession } from './session-cookies';

/**
 * O cadastro foi aceito mas não há sessão para abrir.
 *
 * Cobre dois casos que o Supabase reporta de formas diferentes e que o app
 * trata igual: email já cadastrado, e projeto configurado para exigir
 * confirmação por email. Um nome só para os dois é de propósito — a resposta ao
 * cliente também precisa ser a mesma, senão o endpoint vira um verificador de
 * quais emails têm conta.
 */
export class SemSessaoError extends Error {}

/**
 * Cliente fino do Supabase Auth (GoTrue) via REST.
 *
 * Sem SDK de propósito: usamos três endpoints e o SDK traria um cliente com
 * estado, cache de sessão e persistência em storage — coisas que não fazem
 * sentido no servidor e que atrapalham quando cada requisição é de um usuário
 * diferente.
 */
@Injectable()
export class AuthService {
  constructor(private readonly config: ConfigService) {}

  private get base() {
    const url = this.config.get<string>('SUPABASE_URL');
    if (!url) throw new InternalServerErrorException('SUPABASE_URL não configurado.');
    return `${url}/auth/v1`;
  }

  private get anonKey() {
    const key = this.config.get<string>('SUPABASE_ANON_KEY');
    if (!key) throw new InternalServerErrorException('SUPABASE_ANON_KEY não configurado.');
    return key;
  }

  private async chamar(
    caminho: string,
    body: unknown,
    opcoes: { metodo?: 'POST' | 'PUT'; token?: string } = {},
  ): Promise<any> {
    const resposta = await fetch(`${this.base}${caminho}`, {
      method: opcoes.metodo ?? 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: this.anonKey,
        // Só a troca de senha manda Bearer: ela age em nome da pessoa, com o
        // token de uso único que veio do link do email.
        ...(opcoes.token ? { Authorization: `Bearer ${opcoes.token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const json = await resposta.json().catch(() => ({}));
    if (!resposta.ok) {
      const erro = new Error(json?.msg ?? json?.error_description ?? 'Falha na autenticação.');
      (erro as any).status = resposta.status;
      (erro as any).corpo = json;
      throw erro;
    }
    return json;
  }

  /**
   * Para onde o link do email de confirmação devolve a pessoa.
   *
   * Vai como `redirect_to` no signup em vez de depender do "Site URL" fixo do
   * painel: o Site URL é um só, e o mesmo projeto Supabase atende localhost e
   * produção. Sem isto, confirmar cadastro em desenvolvimento jogaria a pessoa
   * no site publicado — ou o contrário, que é pior.
   *
   * `WEB_ORIGIN` já existe e já é diferente por ambiente (é a mesma origem
   * usada no CORS), então não há uma segunda variável para configurar errado.
   * O Supabase só aceita destinos que estejam na allowlist de Redirect URLs;
   * cada origem usada precisa estar lá.
   */
  private get destinoDeRetorno(): string | null {
    const origem = this.config.get<string>('WEB_ORIGIN')?.split(',')[0]?.trim();
    return origem || null;
  }

  async signup(email: string, senha: string, nome: string): Promise<SupabaseSession> {
    try {
      const destino = this.destinoDeRetorno;
      const json = await this.chamar(
        destino ? `/signup?redirect_to=${encodeURIComponent(destino)}` : '/signup',
        {
          email,
          password: senha,
          data: { nome },
        },
      );
      // Sem sessão na resposta = projeto exige confirmação de email.
      if (!json.access_token) throw new SemSessaoError('Confirmação de email pendente.');
      return json as SupabaseSession;
    } catch (e: any) {
      if (e instanceof SemSessaoError) throw e;
      if (e?.corpo?.msg?.includes('already registered')) {
        throw new SemSessaoError('Email já cadastrado.');
      }
      throw e;
    }
  }

  async login(email: string, senha: string): Promise<SupabaseSession> {
    try {
      return (await this.chamar('/token?grant_type=password', {
        email,
        password: senha,
      })) as SupabaseSession;
    } catch {
      // Mensagem genérica de propósito: distinguir "email não existe" de "senha
      // errada" transforma o login num verificador de cadastro.
      throw new UnauthorizedException('Email ou senha incorretos.');
    }
  }

  async refresh(refreshToken: string): Promise<SupabaseSession> {
    try {
      return (await this.chamar('/token?grant_type=refresh_token', {
        refresh_token: refreshToken,
      })) as SupabaseSession;
    } catch {
      throw new UnauthorizedException('Sessão expirada.');
    }
  }

  // ---- Recuperação de senha e confirmação de email ----

  /**
   * Manda o email com o link de nova senha.
   *
   * Nunca sinaliza se o email existe — quem chama responde igual nos dois
   * casos. É a mesma regra do login: distinguir transformaria o formulário num
   * verificador de quais emails têm conta neste sistema.
   *
   * O `redirect_to` decide para qual ambiente o link volta, pelo mesmo motivo
   * do signup: um projeto Supabase só, atendendo localhost e produção.
   */
  async pedirRecuperacao(email: string): Promise<void> {
    const destino = this.destinoDeRetorno;
    await this.chamar(
      destino ? `/recover?redirect_to=${encodeURIComponent(destino)}` : '/recover',
      { email },
    );
  }

  /**
   * Troca o código do link de email por uma sessão.
   *
   * `token_hash` e não os tokens no fragmento da URL: assim o navegador nunca
   * chega a segurar credencial nenhuma — o código vem no endereço, a API o
   * troca, e o que volta para a professora é o mesmo cookie httpOnly de sempre.
   *
   * Uso único e com validade: um link reaberto no dia seguinte falha aqui, e é
   * por isso que a tela precisa dizer "peça outro" em vez de "erro".
   */
  async trocarCodigo(codigo: string, tipo: 'recovery' | 'signup' | 'email'): Promise<SupabaseSession> {
    try {
      const json = await this.chamar('/verify', { type: tipo, token_hash: codigo });
      if (!json?.access_token) throw new Error('sem sessão');
      return json as SupabaseSession;
    } catch {
      throw new UnauthorizedException('Este link expirou ou já foi usado. Peça um novo.');
    }
  }

  /** Grava a senha nova em nome de quem acabou de provar o email. */
  async definirSenha(accessToken: string, senha: string): Promise<void> {
    await this.chamar('/user', { password: senha }, { metodo: 'PUT', token: accessToken });
  }
}
