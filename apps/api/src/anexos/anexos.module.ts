import { Module } from '@nestjs/common';
import { AnexosController } from './anexos.controller';
import { AnexosService } from './anexos.service';
import { StorageService } from './storage.service';

@Module({
  controllers: [AnexosController],
  providers: [AnexosService, StorageService],
  exports: [AnexosService],
})
export class AnexosModule {}
