import { Body, Controller, ForbiddenException, Get, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { ProfessoresService } from '../professores/professores.service';
import { AuthService, SemSessaoError } from './auth.service';
import { AuthProfessor, CurrentProfessor } from './current-professor.decorator';
import {
  ConfirmarEmailDto,
  LoginDto,
  NovaSenhaDto,
  RecuperarSenhaDto,
  SignupDto,
} from './dto/auth.dto';
import { Public } from './public.decorator';
import { clearSessionCookies, lerRefreshToken, setSessionCookies } from './session-cookies';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly professores: ProfessoresService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('signup')
  async signup(@Body() dto: SignupDto, @Res({ passthrough: true }) res: Response) {
    if (this.config.get<string>('SIGNUP_ABERTO') === 'false') {
      throw new ForbiddenException('Cadastro desativado.');
    }

    try {
      const session = await this.auth.signup(dto.email, dto.senha, dto.nome);
      await this.professores.garantirPerfil(
        session.user.id,
        session.user.email ?? dto.email,
        dto.nome,
      );
      setSessionCookies(this.config, res, session);
      return { ok: true, logado: true };
    } catch (e) {
      // Resposta idêntica para "email já existe" e "confirmação pendente":
      // distingui-las revelaria quais emails têm conta.
      if (e instanceof SemSessaoError) return { ok: true, logado: false };
      throw e;
    }
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const session = await this.auth.login(dto.email, dto.senha);
    const professor = await this.professores.garantirPerfil(
      session.user.id,
      session.user.email ?? dto.email,
    );
    // Checado ANTES de gravar os cookies: conta desativada nunca deve receber
    // sessão, mesmo com a senha certa.
    if (!professor.ativo) throw new ForbiddenException('Conta desativada.');

    setSessionCookies(this.config, res, session);
    return { ok: true, professor: { id: professor.id, nome: professor.nome } };
  }

  @Public()
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = lerRefreshToken(req);
    if (!refreshToken) throw new UnauthorizedException('Sessão ausente.');

    const session = await this.auth.refresh(refreshToken);
    setSessionCookies(this.config, res, session);
    return { ok: true };
  }

  @Public()
  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    clearSessionCookies(this.config, res);
    return { ok: true };
  }

  // ---- Esqueci a senha ----

  /**
   * Manda o email com o link de nova senha.
   *
   * Responde `{ ok: true }` SEMPRE, exista a conta ou não. Um "email não
   * encontrado" aqui deixaria qualquer pessoa descobrir quem tem conta neste
   * sistema — e num sistema de professora, saber que ela usa isto já é
   * informação. É a mesma decisão do login e do signup.
   *
   * Limite mais apertado que o dos outros: cada chamada dispara um email, e um
   * formulário aberto sem sessão é o candidato natural a virar caixa de spam
   * na direção de terceiros.
   */
  @Public()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('recuperar')
  async recuperar(@Body() dto: RecuperarSenhaDto) {
    // O `catch` é a mesma decisão: falha do lado do Supabase (email inexistente,
    // limite de envio) não pode virar resposta diferente.
    await this.auth.pedirRecuperacao(dto.email).catch(() => undefined);
    return { ok: true };
  }

  /**
   * Grava a senha nova e já deixa a professora dentro.
   *
   * Sem "agora entre com a senha nova": ela acabou de provar que é dona do
   * email e acabou de digitar a senha duas vezes. Um formulário de login no
   * meio é um passo que só existe para ser esquecido.
   */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('senha')
  async novaSenha(@Body() dto: NovaSenhaDto, @Res({ passthrough: true }) res: Response) {
    const sessao = await this.auth.trocarCodigo(dto.codigo, 'recovery');
    await this.auth.definirSenha(sessao.access_token, dto.senha);

    const professor = await this.professores.garantirPerfil(
      sessao.user.id,
      sessao.user.email ?? '',
    );
    // Mesma ordem do login: conta desativada não recebe sessão nem com a senha
    // trocada.
    if (!professor.ativo) throw new ForbiddenException('Conta desativada.');

    setSessionCookies(this.config, res, sessao);
    return { ok: true };
  }

  /**
   * Confirma o email do cadastro e abre a sessão.
   *
   * Antes, o link do email caía na raiz do site com os tokens no fragmento da
   * URL, que ninguém lia: ela confirmava, via a tela de login e concluía que a
   * confirmação não tinha funcionado. Aqui o código vira sessão de verdade.
   */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('confirmar')
  async confirmar(@Body() dto: ConfirmarEmailDto, @Res({ passthrough: true }) res: Response) {
    // `signup` é o tipo do link de cadastro; `email` é o que o Supabase usa nos
    // fluxos mais novos. Tentar os dois evita depender da versão do projeto.
    const sessao = await this.auth
      .trocarCodigo(dto.codigo, 'signup')
      .catch(() => this.auth.trocarCodigo(dto.codigo, 'email'));

    const professor = await this.professores.garantirPerfil(
      sessao.user.id,
      sessao.user.email ?? '',
    );
    if (!professor.ativo) throw new ForbiddenException('Conta desativada.');

    setSessionCookies(this.config, res, sessao);
    return { ok: true };
  }

  /** Quem sou eu — o front usa para decidir entre landing e app. */
  @Get('eu')
  eu(@CurrentProfessor() professor: AuthProfessor) {
    return professor;
  }
}
