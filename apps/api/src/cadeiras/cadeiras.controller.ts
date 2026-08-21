import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { AuthProfessor, CurrentProfessor } from '../auth/current-professor.decorator';
import { CadeirasService } from './cadeiras.service';
import { CreateCadeiraDto, UpdateCadeiraDto } from './dto/cadeira.dto';
import { UpsertConfigAlarmeDto } from './dto/config-alarme.dto';

@Controller('cadeiras')
export class CadeirasController {
  constructor(private readonly cadeiras: CadeirasService) {}

  @Get()
  listar(@CurrentProfessor() p: AuthProfessor, @Query('incluirInativas') incluirInativas?: string) {
    return this.cadeiras.listar(p.id, incluirInativas === 'true');
  }

  /**
   * ANTES de `:id` de propósito: registrada depois, "disciplinas" entraria como
   * um id e a rota devolveria 404. É o mesmo tropeço de `/agenda/pendencias`.
   */
  @Get('disciplinas')
  disciplinas(@CurrentProfessor() p: AuthProfessor) {
    return this.cadeiras.disciplinas(p.id);
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

  /**
   * Reativar é POST próprio, e não `PATCH { ativo: true }`.
   *
   * O `PATCH` gravaria a coluna e pararia aí, deixando a turma na tela com a
   * grade inteira cancelada e os alarmes calados — tudo certo na tela, nada
   * funcionando. Uma porta só para a reativação é o que garante que a checagem
   * de choque e a devolução das aulas nunca fiquem para trás.
   */
  @Post(':id/reativar')
  reativar(@CurrentProfessor() p: AuthProfessor, @Param('id') id: string) {
    return this.cadeiras.reativar(p.id, id);
  }

  @Get(':id/alarme')
  configAlarme(@CurrentProfessor() p: AuthProfessor, @Param('id') id: string) {
    return this.cadeiras.configAlarme(p.id, id);
  }

  @Put(':id/alarme')
  salvarConfigAlarme(
    @CurrentProfessor() p: AuthProfessor,
    @Param('id') id: string,
    @Body() dto: UpsertConfigAlarmeDto,
  ) {
    return this.cadeiras.salvarConfigAlarme(p.id, id, dto);
  }

  @Delete(':id/alarme')
  limparConfigAlarme(@CurrentProfessor() p: AuthProfessor, @Param('id') id: string) {
    return this.cadeiras.limparConfigAlarme(p.id, id);
  }
}
