import { Body, Controller, Get, Patch } from '@nestjs/common';
import { AuthProfessor, CurrentProfessor } from '../auth/current-professor.decorator';
import { ProfessoresService } from './professores.service';
import { UpdatePerfilDto } from './dto/perfil.dto';

@Controller('perfil')
export class ProfessoresController {
  constructor(private readonly professores: ProfessoresService) {}

  @Get()
  buscar(@CurrentProfessor() professor: AuthProfessor) {
    return this.professores.buscar(professor.id);
  }

  @Patch()
  atualizar(@CurrentProfessor() professor: AuthProfessor, @Body() dto: UpdatePerfilDto) {
    return this.professores.atualizar(professor.id, dto);
  }
}
