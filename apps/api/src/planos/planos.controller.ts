import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthProfessor, CurrentProfessor } from '../auth/current-professor.decorator';
import { TAMANHO_MAXIMO, type ArquivoRecebido } from '../anexos/anexos.service';
import {
  CreatePlanoDto,
  CreateTopicoDto,
  CreateUnidadeDto,
  ImportarUnidadesDto,
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

  /**
   * O caminho de entrada: o PDF cria o plano.
   *
   * **Antes de `@Get(':id')`** de propósito — o Nest casa as rotas na ordem em
   * que são declaradas, e `importar` viraria o `:id` de uma busca por plano.
   */
  @Post('importar')
  @UseInterceptors(FileInterceptor('arquivo', { limits: { fileSize: TAMANHO_MAXIMO } }))
  importarDocumento(
    @CurrentProfessor() p: AuthProfessor,
    @UploadedFile() arquivo: ArquivoRecebido,
  ) {
    return this.planos.criarDoDocumento(p.id, arquivo);
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

  /** As unidades que ela confirmou depois de ler o documento importado. */
  @Post(':id/unidades/importar')
  importarUnidades(
    @CurrentProfessor() p: AuthProfessor,
    @Param('id') id: string,
    @Body() dto: ImportarUnidadesDto,
  ) {
    return this.planos.importarUnidades(p.id, id, dto);
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
