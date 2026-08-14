import { Module } from '@nestjs/common';
import { AlarmesModule } from '../alarmes/alarmes.module';
import { SeriesModule } from '../series/series.module';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

@Module({
  imports: [SeriesModule, AlarmesModule],
  controllers: [JobsController],
  providers: [JobsService],
})
export class JobsModule {}
