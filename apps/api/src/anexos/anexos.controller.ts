import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthProfessor, CurrentProfessor } from '../auth/current-professor.decorator';
import { AnexosService, TAMANHO_MAXIMO, type ArquivoRecebido } from './anexos.service';

@Controller()
export class AnexosController {
  constructor(private readonly anexos: AnexosService) {}

  @Get('registros/ocorrencia/:ocorrenciaId/anexos')
  listar(@CurrentProfessor() p: AuthProfessor, @Param('ocorrenciaId') ocorrenciaId: string) {
    return this.anexos.listar(p.id, ocorrenciaId);
  }

  /**
   * Upload em memória, com o teto declarado no próprio interceptor.
   *
   * `limits` aqui é a primeira barreira: sem ele, o multer aceitaria o corpo
   * inteiro antes de o service ter chance de recusar — e um PDF de 300 MB
   * derrubaria o processo por falta de memória antes de virar erro 400.
   */
  @Post('registros/ocorrencia/:ocorrenciaId/anexos')
  @UseInterceptors(FileInterceptor('arquivo', { limits: { fileSize: TAMANHO_MAXIMO } }))
  enviar(
    @CurrentProfessor() p: AuthProfessor,
    @Param('ocorrenciaId') ocorrenciaId: string,
    @UploadedFile() arquivo: ArquivoRecebido,
  ) {
    return this.anexos.enviar(p.id, ocorrenciaId, arquivo);
  }

  @Delete('anexos/:id')
  remover(@CurrentProfessor() p: AuthProfessor, @Param('id') id: string) {
    return this.anexos.remover(p.id, id);
  }
}
