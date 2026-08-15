import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { AuthProfessor, CurrentProfessor } from '../auth/current-professor.decorator';
import {
  CreatePlanoDto,
  CreateTopicoDto,
  CreateUnidadeDto,
  UpdatePlanoDto,
  UpdateTopicoDto,
  UpdateUnidadeDto,
} from './dto/plano.dto';
import { PlanosService } from './planos.service';

@Controller('planos')
export class PlanosController {
  constructor(private readonly planos: PlanosService) {}

  @Get()
  listar(@CurrentProfessor() p: AuthProfessor) {
    return this.planos.listar(p.id);
  }

  @Post()
  criar(@CurrentProfessor() p: AuthProfessor, @Body() dto: CreatePlanoDto) {
    return this.planos.criar(p.id, dto);
  }

  @Get(':id')
  buscar(@CurrentProfessor() p: AuthProfessor, @Param('id') id: string) {
    return this.planos.buscar(p.id, id);
  }

  @Patch(':id')
  atualizar(
    @CurrentProfessor() p: AuthProfessor,
    @Param('id') id: string,
    @Body() dto: UpdatePlanoDto,
  ) {
    return this.planos.atualizar(p.id, id, dto);
  }

  @Delete(':id')
  remover(@CurrentProfessor() p: AuthProfessor, @Param('id') id: string) {
    return this.planos.remover(p.id, id);
  }

  // ---- Unidades -----------------------------------------------------------

  @Post(':id/unidades')
  criarUnidade(
    @CurrentProfessor() p: AuthProfessor,
    @Param('id') id: string,
    @Body() dto: CreateUnidadeDto,
  ) {
    return this.planos.criarUnidade(p.id, id, dto);
  }

  @Patch(':id/unidades/:unidadeId')
  atualizarUnidade(
    @CurrentProfessor() p: AuthProfessor,
    @Param('id') id: string,
    @Param('unidadeId') unidadeId: string,
    @Body() dto: UpdateUnidadeDto,
  ) {
    return this.planos.atualizarUnidade(p.id, id, unidadeId, dto);
  }

  @Delete(':id/unidades/:unidadeId')
  removerUnidade(
    @CurrentProfessor() p: AuthProfessor,
    @Param('id') id: string,
    @Param('unidadeId') unidadeId: string,
  ) {
    return this.planos.removerUnidade(p.id, id, unidadeId);
  }

  // ---- Tópicos ------------------------------------------------------------

  @Post(':id/unidades/:unidadeId/topicos')
  criarTopico(
    @CurrentProfessor() p: AuthProfessor,
    @Param('id') id: string,
    @Param('unidadeId') unidadeId: string,
    @Body() dto: CreateTopicoDto,
  ) {
    return this.planos.criarTopico(p.id, id, unidadeId, dto);
  }

  @Patch(':id/unidades/:unidadeId/topicos/:topicoId')
  atualizarTopico(
    @CurrentProfessor() p: AuthProfessor,
    @Param('id') id: string,
    @Param('unidadeId') unidadeId: string,
    @Param('topicoId') topicoId: string,
    @Body() dto: UpdateTopicoDto,
  ) {
    return this.planos.atualizarTopico(p.id, id, unidadeId, topicoId, dto);
  }

  @Delete(':id/unidades/:unidadeId/topicos/:topicoId')
  removerTopico(
    @CurrentProfessor() p: AuthProfessor,
    @Param('id') id: string,
    @Param('unidadeId') unidadeId: string,
    @Param('topicoId') topicoId: string,
  ) {
    return this.planos.removerTopico(p.id, id, unidadeId, topicoId);
  }
}
