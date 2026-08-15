import { Global, Module } from '@nestjs/common';
import { PushModule } from '../push/push.module';
import { ErrosService } from './erros.service';

/**
 * `@Global` porque o filtro de exceção e os crons precisam do ErrosService sem
 * que cada módulo tenha de importá-lo — tratamento de erro é transversal, e
 * exigir o import em cada lugar é justamente como um caminho de erro passa
 * despercebido.
 */
@Global()
@Module({
  imports: [PushModule],
  providers: [ErrosService],
  exports: [ErrosService],
})
export class ErrosModule {}
