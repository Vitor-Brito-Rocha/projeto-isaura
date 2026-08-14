import { Module } from '@nestjs/common';
import { EscolasController } from './escolas.controller';
import { EscolasService } from './escolas.service';

@Module({
  controllers: [EscolasController],
  providers: [EscolasService],
  exports: [EscolasService],
})
export class EscolasModule {}
