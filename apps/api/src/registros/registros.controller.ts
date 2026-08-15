import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { AuthProfessor, CurrentProfessor } from '../auth/current-professor.decorator';
import { SalvarAberturaDto, SalvarFechamentoDto } from './dto/registro.dto';
import { RegistrosService } from './registros.service';

/**
 * Rotas por OCORRÊNCIA, e não por id de registro, de propósito: o alarme leva
 * `/aula/:ocorrenciaId`, e nesse momento o registro pode ainda não existir. A
 * tela nunca precisa saber se está criando ou editando.
 */
@Controller('registros')
export class RegistrosController {
  constructor(private readonly registros: RegistrosService) {}

  @Get('ocorrencia/:ocorrenciaId')
  contexto(@CurrentProfessor() p: AuthProfessor, @Param('ocorrenciaId') ocorrenciaId: string) {
    return this.registros.contexto(p.id, ocorrenciaId);
  }

  @Put('ocorrencia/:ocorrenciaId/abertura')
  salvarAbertura(
    @CurrentProfessor() p: AuthProfessor,
    @Param('ocorrenciaId') ocorrenciaId: string,
    @Body() dto: SalvarAberturaDto,
  ) {
    return this.registros.salvarAbertura(p.id, ocorrenciaId, dto);
  }

  @Put('ocorrencia/:ocorrenciaId/fechamento')
  salvarFechamento(
    @CurrentProfessor() p: AuthProfessor,
    @Param('ocorrenciaId') ocorrenciaId: string,
    @Body() dto: SalvarFechamentoDto,
  ) {
    return this.registros.salvarFechamento(p.id, ocorrenciaId, dto);
  }
}
