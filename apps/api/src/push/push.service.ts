import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntensidadeAlarme, TipoNotificacao } from '@prisma/client';
import * as webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';
import { SubscribeDto } from './dto/push.dto';

export interface PushAction {
  action: string; // id tratado no service worker
  title: string; // rótulo do botão
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  ocorrenciaId?: string;
  /** Sem `tipo` não persiste na central in-app. */
  tipo?: TipoNotificacao;
  actions?: PushAction[];

  /**
   * Vai no payload em vez de numa tabela fixa no service worker: a intensidade
   * é escolha da professora POR CADEIRA, então o SW não tem como saber qual
   * usar — ele só sabe o que chegou.
   */
  intensidade?: IntensidadeAlarme;
  som?: boolean;
  vibra?: boolean;
}

@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private ativo = false;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit() {
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY');
    const subject = this.config.get<string>('VAPID_SUBJECT') ?? 'mailto:admin@exemplo.com';
    if (publicKey && privateKey) {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      this.ativo = true;
    } else {
      // Aviso, não erro: sem VAPID a API sobe e todo o resto funciona. Derrubar
      // o boot por causa de push transformaria uma degradação em indisponibilidade.
      this.logger.warn('VAPID não configurado — push desativado.');
    }
  }

  get vapidPublicKey() {
    return this.config.get<string>('VAPID_PUBLIC_KEY') ?? '';
  }

  subscribe(professorId: string, dto: SubscribeDto) {
    return this.prisma.pushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      create: {
        professorId,
        endpoint: dto.endpoint,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
        userAgent: dto.userAgent,
      },
      // O professorId entra no update de propósito: o mesmo aparelho pode
      // trocar de conta (ela testa, empresta, reinstala), e a subscription tem
      // de seguir quem está logado agora — senão o alarme dela vai para o
      // celular de outra pessoa.
      update: { professorId, p256dh: dto.keys.p256dh, auth: dto.keys.auth },
    });
  }

  async unsubscribe(professorId: string, endpoint: string) {
    await this.prisma.pushSubscription.deleteMany({ where: { endpoint, professorId } });
    return { ok: true };
  }

  /**
   * Envia para todos os dispositivos do professor e registra na central in-app.
   *
   * A gravação da `Notificacao` acontece ANTES e independe do push: se não houver
   * dispositivo inscrito, se o push falhar, se ela estiver com o celular
   * desligado — o registro do alarme não se perde. É a rede de segurança do
   * sistema inteiro.
   */
  async enviarPush(professorId: string, payload: PushPayload): Promise<number> {
    if (payload.tipo) {
      await this.prisma.notificacao
        .create({
          data: {
            professorId,
            tipo: payload.tipo,
            titulo: payload.title,
            corpo: payload.body,
            url: payload.url,
            ocorrenciaId: payload.ocorrenciaId,
          },
        })
        .catch((e) => this.logger.warn(`Falha ao gravar notificação: ${e?.message}`));
    }

    // SILENCIOSO significa "só histórico" — a linha acima já cumpriu isso.
    if (payload.intensidade === IntensidadeAlarme.SILENCIOSO) return 0;
    if (!this.ativo) return 0;

    const subs = await this.prisma.pushSubscription.findMany({ where: { professorId } });
    let enviados = 0;

    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            JSON.stringify(payload),
          );
          enviados++;
        } catch (err: any) {
          const status = err?.statusCode;
          // 404/410 = subscription morta (app desinstalado, permissão revogada).
          // Apagar aqui é o que impede a tabela de virar um cemitério que faz o
          // envio ficar mais lento a cada mês.
          if (status === 404 || status === 410) {
            await this.prisma.pushSubscription.deleteMany({ where: { endpoint: s.endpoint } });
          } else {
            this.logger.warn(`Falha ao enviar push: ${status ?? err?.message}`);
          }
        }
      }),
    );

    return enviados;
  }
}
