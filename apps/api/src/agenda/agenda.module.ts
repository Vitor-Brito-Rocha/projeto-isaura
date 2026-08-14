import { Module } from '@nestjs/common';
import { AgendaController } from './agenda.controller';
import { AgendaService } from './agenda.service';
import { RecorrenciaService } from './recorrencia.service';

@Module({
  controllers: [AgendaController],
  providers: [AgendaService, RecorrenciaService],
  exports: [AgendaService, RecorrenciaService],
})
export class AgendaModule {}
