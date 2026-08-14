import { Body, Controller, ForbiddenException, Get, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { ProfessoresService } from '../professores/professores.service';
import { AuthService, SemSessaoError } from './auth.service';
import { AuthProfessor, CurrentProfessor } from './current-professor.decorator';
import { LoginDto, SignupDto } from './dto/auth.dto';
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

  /** Quem sou eu — o front usa para decidir entre landing e app. */
  @Get('eu')
  eu(@CurrentProfessor() professor: AuthProfessor) {
    return professor;
  }
}
