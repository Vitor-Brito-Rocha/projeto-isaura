import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { AuthProfessor, CurrentProfessor } from '../auth/current-professor.decorator';
import { NotificacoesService } from './notificacoes.service';

@Controller('notificacoes')
export class NotificacoesController {
  constructor(private readonly notificacoes: NotificacoesService) {}

  @Get()
  listar(@CurrentProfessor() p: AuthProfessor, @Query('naoLidas') naoLidas?: string) {
    return this.notificacoes.listar(p.id, naoLidas === 'true');
  }

  @Get('contagem')
  contagem(@CurrentProfessor() p: AuthProfessor) {
    return this.notificacoes.contarNaoLidas(p.id);
  }

  @Post(':id/lida')
  marcarLida(@CurrentProfessor() p: AuthProfessor, @Param('id') id: string) {
    return this.notificacoes.marcarLida(p.id, id);
  }

  @Post('todas-lidas')
  marcarTodasLidas(@CurrentProfessor() p: AuthProfessor) {
    return this.notificacoes.marcarTodasLidas(p.id);
  }
}
