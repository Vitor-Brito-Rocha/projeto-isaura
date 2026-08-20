import { Module } from '@nestjs/common';
import { StorageService } from '../anexos/storage.service';
import { IaController } from './ia.controller';
import { ImportacaoService } from './importacao.service';
import { ModeloService } from './modelo.service';
import { ResumoService } from './resumo.service';

@Module({
  controllers: [IaController],
  providers: [ResumoService, ImportacaoService, ModeloService, StorageService],
  // O `PlanosModule` importa para a importação poder criar o plano.
  exports: [ImportacaoService, StorageService],
})
export class IaModule {}
