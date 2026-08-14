import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { AuthProfessor, CurrentProfessor } from '../auth/current-professor.decorator';
import { CreateEscolaDto, UpdateEscolaDto } from './dto/escola.dto';
import { EscolasService } from './escolas.service';

@Controller('escolas')
export class EscolasController {
  constructor(private readonly escolas: EscolasService) {}

  @Get()
  listar(@CurrentProfessor() p: AuthProfessor) {
    return this.escolas.listar(p.id);
  }

  @Post()
  criar(@CurrentProfessor() p: AuthProfessor, @Body() dto: CreateEscolaDto) {
    return this.escolas.criar(p.id, dto);
  }

  @Get(':id')
  buscar(@CurrentProfessor() p: AuthProfessor, @Param('id') id: string) {
    return this.escolas.buscar(p.id, id);
  }

  @Patch(':id')
  atualizar(
    @CurrentProfessor() p: AuthProfessor,
    @Param('id') id: string,
    @Body() dto: UpdateEscolaDto,
  ) {
    return this.escolas.atualizar(p.id, id, dto);
  }

  @Delete(':id')
  remover(@CurrentProfessor() p: AuthProfessor, @Param('id') id: string) {
    return this.escolas.remover(p.id, id);
  }
}
