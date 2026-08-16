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

  /**
   * O documento de origem do plano de curso — a foto ou o PDF que ela já tem.
   *
   * Fora do `PlanosController` de propósito: quem sabe validar arquivo, assinar
   * URL e falar com o Storage é este módulo, e espalhar isso por dois
   * controllers é como as duas cópias começam a divergir.
   */
  @Get('planos/:planoId/anexos')
  listarDoPlano(@CurrentProfessor() p: AuthProfessor, @Param('planoId') planoId: string) {
    return this.anexos.listarDoPlano(p.id, planoId);
  }

  @Post('planos/:planoId/anexos')
  @UseInterceptors(FileInterceptor('arquivo', { limits: { fileSize: TAMANHO_MAXIMO } }))
  enviarParaPlano(
    @CurrentProfessor() p: AuthProfessor,
    @Param('planoId') planoId: string,
    @UploadedFile() arquivo: ArquivoRecebido,
  ) {
    return this.anexos.enviarParaPlano(p.id, planoId, arquivo);
  }

  @Delete('anexos/:id')
  remover(@CurrentProfessor() p: AuthProfessor, @Param('id') id: string) {
    return this.anexos.remover(p.id, id);
  }
}
