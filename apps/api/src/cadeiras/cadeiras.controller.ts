import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { AuthProfessor, CurrentProfessor } from '../auth/current-professor.decorator';
import { CadeirasService } from './cadeiras.service';
import { CreateCadeiraDto, UpdateCadeiraDto } from './dto/cadeira.dto';

@Controller('cadeiras')
export class CadeirasController {
  constructor(private readonly cadeiras: CadeirasService) {}

  @Get()
  listar(@CurrentProfessor() p: AuthProfessor, @Query('incluirInativas') incluirInativas?: string) {
    return this.cadeiras.listar(p.id, incluirInativas === 'true');
  }

  @Post()
  criar(@CurrentProfessor() p: AuthProfessor, @Body() dto: CreateCadeiraDto) {
    return this.cadeiras.criar(p.id, dto);
  }

  @Get(':id')
  buscar(@CurrentProfessor() p: AuthProfessor, @Param('id') id: string) {
    return this.cadeiras.buscar(p.id, id);
  }

  @Patch(':id')
  atualizar(
    @CurrentProfessor() p: AuthProfessor,
    @Param('id') id: string,
    @Body() dto: UpdateCadeiraDto,
  ) {
    return this.cadeiras.atualizar(p.id, id, dto);
  }

  @Delete(':id')
  desativar(@CurrentProfessor() p: AuthProfessor, @Param('id') id: string) {
    return this.cadeiras.desativar(p.id, id);
  }
}
