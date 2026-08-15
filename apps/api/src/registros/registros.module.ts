import { Module } from '@nestjs/common';
import { AnexosModule } from '../anexos/anexos.module';
import { RegistrosController } from './registros.controller';
import { RegistrosService } from './registros.service';

@Module({
  // Só pelo descarte do áudio na revisão: quem sabe que o fechamento virou
  // registro é este módulo, e o áudio precisa morrer no mesmo instante.
  imports: [AnexosModule],
  controllers: [RegistrosController],
  providers: [RegistrosService],
  exports: [RegistrosService],
})
export class RegistrosModule {}
