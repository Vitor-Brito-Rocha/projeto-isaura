import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { AuthProfessor, CurrentProfessor } from '../auth/current-professor.decorator';
import { AgendaService } from './agenda.service';
import {
  ListarAgendaDto,
  ListarPendenciasDto,
  UpdateOcorrenciaDto,
} from './dto/ocorrencia.dto';

@Controller('agenda')
export class AgendaController {
  constructor(private readonly agenda: AgendaService) {}

  @Get()
  listar(@CurrentProfessor() p: AuthProfessor, @Query() q: ListarAgendaDto) {
    return this.agenda.listar(p.id, q.de, q.ate, q.cadeiraId);
  }

  /** Antes de `:id` de propósito: o parâmetro engoliria esta rota. */
  @Get('pendencias')
  pendencias(@CurrentProfessor() p: AuthProfessor, @Query() q: ListarPendenciasDto) {
    return this.agenda.pendencias(p.id, q.dias ?? 45);
  }

  @Get(':id')
  buscar(@CurrentProfessor() p: AuthProfessor, @Param('id') id: string) {
    return this.agenda.buscar(p.id, id);
  }

  @Patch(':id')
  atualizar(
    @CurrentProfessor() p: AuthProfessor,
    @Param('id') id: string,
    @Body() dto: UpdateOcorrenciaDto,
  ) {
    return this.agenda.atualizar(p.id, id, dto);
  }
}
