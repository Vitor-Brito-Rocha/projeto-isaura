import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';

export class ListarErrosDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pagina?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  tamanho?: number;

  /** "http", "cron", ou o nome de um service. */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  origem?: string;
}

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  /**
   * A tela usa isto para decidir se mostra o item de menu.
   *
   * Existe como rota separada porque a alternativa — a tela adivinhar pelo
   * email — colocaria a regra de quem é admin no navegador, onde qualquer um
   * edita. Aqui o front só descobre o que o servidor já decidiu.
   */
  @Get('status')
  status() {
    return { admin: true };
  }

  @Get('resumo')
  resumo() {
    return this.admin.resumo();
  }

  @Get('professores')
  professores() {
    return this.admin.professores();
  }

  @Get('erros')
  erros(@Query() q: ListarErrosDto) {
    return this.admin.erros(q.pagina ?? 1, q.tamanho ?? 30, q.origem);
  }

  @Get('erros/:id')
  erro(@Param('id') id: string) {
    return this.admin.erro(id);
  }
}
