import { Controller, Get, Query } from '@nestjs/common';
import { AuthProfessor, CurrentProfessor } from '../auth/current-professor.decorator';
import { ConsultaHistoricoDto } from './dto/historico.dto';
import { HistoricoService } from './historico.service';

@Controller('historico')
export class HistoricoController {
  constructor(private readonly historico: HistoricoService) {}

  @Get()
  listar(@CurrentProfessor() p: AuthProfessor, @Query() consulta: ConsultaHistoricoDto) {
    return this.historico.listar(p.id, consulta);
  }
}
