import { Module } from '@nestjs/common';
import { IaController } from './ia.controller';
import { ResumoService } from './resumo.service';

@Module({
  controllers: [IaController],
  providers: [ResumoService],
})
export class IaModule {}
