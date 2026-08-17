import { Controller, Get, Param } from '@nestjs/common';
import { AuthProfessor, CurrentProfessor } from '../auth/current-professor.decorator';
import { ProgressoService } from './progresso.service';

@Controller('progresso')
export class ProgressoController {
  constructor(private readonly progresso: ProgressoService) {}

  @Get()
  resumo(@CurrentProfessor() p: AuthProfessor) {
    return this.progresso.resumo(p.id);
  }

  @Get(':cadeiraId')
  daCadeira(@CurrentProfessor() p: AuthProfessor, @Param('cadeiraId') cadeiraId: string) {
    return this.progresso.daCadeira(p.id, cadeiraId);
  }
}
