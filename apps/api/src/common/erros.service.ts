import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TipoNotificacao } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';

/** Um mesmo erro repetido não vira enxurrada de push no celular do admin. */
const COOLDOWN_MS = 5 * 60_000;

/**
 * Registra 5xx e falha de cron no banco e avisa o admin por push na hora.
 * Padrão herdado do projeto-professor.
 *
 * **Nunca lança.** É chamado de dentro do tratamento de outro erro — se ele
 * mesmo estourar, o erro original some e o processo pode cair por unhandled
 * rejection. Toda falha interna aqui vira `logger.warn` e segue.
 */
@Injectable()
export class ErrosService {
  private readonly logger = new Logger(ErrosService.name);
  private professorIdCache: string | null = null;
  private readonly ultimoEnvio = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
    private readonly config: ConfigService,
  ) {}

  async registrar(
    origem: string,
    metodo: string,
    rota: string,
    professorId: string | undefined,
    mensagem: string,
    stack?: string,
  ) {
    try {
      await this.prisma.erroLog.create({
        data: { origem, metodo, rota, professorId, mensagem, stack },
      });
    } catch (e) {
      this.logger.warn(`Falha ao gravar ErroLog: ${(e as Error)?.message}`);
    }

    await this.alertar(`${metodo} ${rota}`, '⚠️ Erro no sistema', `${rota}: ${mensagem}`);
  }

  private async alertar(assinatura: string, titulo: string, corpo: string) {
    const adminEmail = this.config.get<string>('ADMIN_EMAIL')?.trim().toLowerCase();
    if (!adminEmail) return; // sem admin configurado, só o banco guarda

    const ultimo = this.ultimoEnvio.get(assinatura);
    if (ultimo && Date.now() - ultimo < COOLDOWN_MS) return;

    try {
      if (!this.professorIdCache) {
        const admin = await this.prisma.professor.findFirst({
          where: { email: { equals: adminEmail, mode: 'insensitive' } },
          select: { id: true },
        });
        if (!admin) {
          this.logger.warn(`ADMIN_EMAIL "${adminEmail}" não corresponde a nenhum professor.`);
          return;
        }
        this.professorIdCache = admin.id;
      }

      await this.push.enviarPush(this.professorIdCache, {
        title: titulo,
        body: corpo,
        /**
         * Por assinatura, não fixa: erro DIFERENTE precisa apitar. Com uma tag
         * só, o segundo alerta substituía o primeiro em silêncio no iPhone, e
         * uma falha nova passava despercebida. Repetição do MESMO erro já é
         * contida pelo cooldown acima, então colapsar por assinatura mantém o
         * que a tag servia para fazer.
         */
        tag: `erro-${assinatura}`,
        url: '/config',
        tipo: TipoNotificacao.GERAL,
      });
      this.ultimoEnvio.set(assinatura, Date.now());
    } catch (e) {
      this.logger.warn(`Falha ao alertar admin: ${(e as Error)?.message}`);
    }
  }
}
