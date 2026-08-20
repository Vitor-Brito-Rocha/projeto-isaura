import { Module } from '@nestjs/common';
import { AnexosModule } from '../anexos/anexos.module';
import { IaModule } from '../ia/ia.module';
import { PlanosController } from './planos.controller';
import { PlanosService } from './planos.service';

/**
 * `IaModule` e `AnexosModule` entram porque a importação cria o plano: quem lê o
 * PDF é o `ImportacaoService` e quem guarda o arquivo é o `AnexosService`.
 * Reusar os dois é o que mantém a sanitização de nome, o teto de 10 MB e a
 * recusa de PDF escaneado num lugar só.
 */
@Module({
  imports: [IaModule, AnexosModule],
  controllers: [PlanosController],
  providers: [PlanosService],
  exports: [PlanosService],
})
export class PlanosModule {}
