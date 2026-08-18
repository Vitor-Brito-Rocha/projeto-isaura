import { Body, Controller, Get, Post } from '@nestjs/common';
import { IntensidadeAlarme, TipoNotificacao } from '@prisma/client';
import { AuthProfessor, CurrentProfessor } from '../auth/current-professor.decorator';
import { Public } from '../auth/public.decorator';
import { SubscribeDto, TestePushDto, UnsubscribeDto } from './dto/push.dto';
import { PushService } from './push.service';

@Controller('push')
export class PushController {
  constructor(private readonly push: PushService) {}

  /** Pública: o front precisa da chave ANTES de ter sessão para montar a tela. */
  @Public()
  @Get('chave-publica')
  chavePublica() {
    return { chave: this.push.vapidPublicKey };
  }

  @Post('subscribe')
  subscribe(@CurrentProfessor() p: AuthProfessor, @Body() dto: SubscribeDto) {
    return this.push.subscribe(p.id, dto);
  }

  @Post('unsubscribe')
  unsubscribe(@CurrentProfessor() p: AuthProfessor, @Body() dto: UnsubscribeDto) {
    return this.push.unsubscribe(p.id, dto.endpoint);
  }

  /**
   * Push de teste. Existe para a professora conferir, no aparelho dela, que o
   * alarme chega — antes de depender dele numa terça de manhã.
   */
  @Post('teste')
  async teste(@CurrentProfessor() p: AuthProfessor, @Body() dto: TestePushDto) {
    const enviados = await this.push.enviarPush(p.id, {
      title: 'Teste de alarme',
      body: 'Se você está lendo isto, os alarmes estão funcionando neste aparelho.',
      tipo: dto.tipo ?? TipoNotificacao.GERAL,
      /**
       * Tag ÚNICA a cada envio — e isso não é detalhe.
       *
       * Notificação com a mesma `tag` SUBSTITUI a anterior, e a plataforma não
       * re-alerta ao substituir: sem som, sem vibração. O `renotify` existe
       * para pedir o contrário, e o iOS não o implementa. Com tag fixa, o
       * primeiro teste apitava no iPhone e todos os seguintes chegavam mudos —
       * que é exatamente o oposto do que um botão de teste serve para provar.
       */
      tag: `teste-${Date.now()}`,
      intensidade: IntensidadeAlarme.NOTIFICACAO,
      som: true,
      vibra: true,
    });
    return { enviados };
  }
}
