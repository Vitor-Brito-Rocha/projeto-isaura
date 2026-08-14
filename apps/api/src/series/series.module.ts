import { Module } from '@nestjs/common';
import { RecorrenciaService } from '../agenda/recorrencia.service';
import { SeriesController } from './series.controller';
import { SeriesService } from './series.service';

@Module({
  controllers: [SeriesController],
  providers: [SeriesService, RecorrenciaService],
  exports: [SeriesService],
})
export class SeriesModule {}
