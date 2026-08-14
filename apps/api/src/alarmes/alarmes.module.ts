import { Module } from '@nestjs/common';
import { PushModule } from '../push/push.module';
import { AlarmesService } from './alarmes.service';

@Module({
  imports: [PushModule],
  providers: [AlarmesService],
  exports: [AlarmesService],
})
export class AlarmesModule {}
