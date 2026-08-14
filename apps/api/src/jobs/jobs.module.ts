import { Module } from '@nestjs/common';
import { SeriesModule } from '../series/series.module';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

@Module({
  imports: [SeriesModule],
  controllers: [JobsController],
  providers: [JobsService],
})
export class JobsModule {}
