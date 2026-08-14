import { Module } from '@nestjs/common';
import { CadeirasController } from './cadeiras.controller';
import { CadeirasService } from './cadeiras.service';

@Module({
  controllers: [CadeirasController],
  providers: [CadeirasService],
  exports: [CadeirasService],
})
export class CadeirasModule {}
