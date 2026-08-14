import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { AuthProfessor, CurrentProfessor } from '../auth/current-professor.decorator';
import { CreateSerieDto, UpdateSerieDto } from './dto/serie.dto';
import { SeriesService } from './series.service';

@Controller('series')
export class SeriesController {
  constructor(private readonly series: SeriesService) {}

  @Get()
  listar(@CurrentProfessor() p: AuthProfessor, @Query('cadeiraId') cadeiraId?: string) {
    return this.series.listar(p.id, cadeiraId);
  }

  @Post()
  criar(@CurrentProfessor() p: AuthProfessor, @Body() dto: CreateSerieDto) {
    return this.series.criar(p.id, dto);
  }

  @Get(':id')
  buscar(@CurrentProfessor() p: AuthProfessor, @Param('id') id: string) {
    return this.series.buscar(p.id, id);
  }

  @Patch(':id')
  atualizar(
    @CurrentProfessor() p: AuthProfessor,
    @Param('id') id: string,
    @Body() dto: UpdateSerieDto,
  ) {
    return this.series.atualizar(p.id, id, dto);
  }

  @Delete(':id')
  remover(@CurrentProfessor() p: AuthProfessor, @Param('id') id: string) {
    return this.series.remover(p.id, id);
  }
}
