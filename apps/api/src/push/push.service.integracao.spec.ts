import { ConfigService } from '@nestjs/config';
import { IntensidadeAlarme, PrismaClient, TipoNotificacao } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from './push.service';
import { urlDeTeste } from '../common/teste-db';

/**
 * Ver o cabeçalho de series.service.integracao.spec.ts para como rodar.
 *
 * O foco é a rede de segurança: a `Notificacao` in-app tem de ser gravada mesmo
 * quando nada é enviado. Sem VAPID configurado o serviço fica inativo, que é
 * exatamente o cenário que queremos exercitar — se o registro dependesse do
 * push, um alarme perdido sumiria sem deixar rastro.
 */
const url = urlDeTeste();
const descreve = url ? describe : describe.skip;

descreve('PushService (integração)', () => {
  let prisma: PrismaService;
  let servico: PushService;

  const PROF = 'prof-push';
  const OUTRO = 'prof-push-outro';

  beforeAll(() => {
    prisma = new PrismaClient({ datasources: { db: { url } } }) as unknown as PrismaService;
    // ConfigService vazio → sem VAPID → `ativo = false`.
    servico = new PushService(new ConfigService({}), prisma);
    servico.onModuleInit();
  });

  afterAll(async () => {
    await prisma.professor.deleteMany({ where: { id: { in: [PROF, OUTRO] } } });
    await (prisma as unknown as PrismaClient).$disconnect();
  });

  beforeEach(async () => {
    await prisma.professor.deleteMany({ where: { id: { in: [PROF, OUTRO] } } });
    await prisma.professor.createMany({
      data: [
        { id: PROF, nome: 'Isaura', email: 'push@teste.dev' },
        { id: OUTRO, nome: 'Outro', email: 'push2@teste.dev' },
      ],
    });
  });

  it('grava a notificação in-app mesmo sem dispositivo inscrito', async () => {
    const enviados = await servico.enviarPush(PROF, {
      title: 'Matemática · 8º A',
      body: 'A aula terminou. O que você deu?',
      tipo: TipoNotificacao.FECHAMENTO_AULA,
      intensidade: IntensidadeAlarme.NOTIFICACAO,
    });

    expect(enviados).toBe(0); // nada enviado — nenhum device, VAPID off
    const [n] = await prisma.notificacao.findMany({ where: { professorId: PROF } });
    expect(n.tipo).toBe(TipoNotificacao.FECHAMENTO_AULA);
    expect(n.lida).toBe(false);
  });

  it('SILENCIOSO grava histórico e não envia', async () => {
    await servico.enviarPush(PROF, {
      title: 'Matemática · 8º A',
      body: 'A aula terminou.',
      tipo: TipoNotificacao.FECHAMENTO_AULA,
      intensidade: IntensidadeAlarme.SILENCIOSO,
    });

    // A tabela de degradação promete "só histórico" — é literalmente isto.
    expect(await prisma.notificacao.count({ where: { professorId: PROF } })).toBe(1);
  });

  it('sem `tipo`, não persiste (é aviso efêmero, não item de histórico)', async () => {
    await servico.enviarPush(PROF, { title: 'oi', body: 'teste' });

    expect(await prisma.notificacao.count({ where: { professorId: PROF } })).toBe(0);
  });

  describe('subscribe', () => {
    const endpoint = 'https://fcm.exemplo.dev/abc123';

    it('é idempotente por endpoint', async () => {
      await servico.subscribe(PROF, { endpoint, keys: { p256dh: 'k1', auth: 'a1' } });
      await servico.subscribe(PROF, { endpoint, keys: { p256dh: 'k2', auth: 'a2' } });

      const subs = await prisma.pushSubscription.findMany({ where: { professorId: PROF } });
      expect(subs).toHaveLength(1);
      expect(subs[0].p256dh).toBe('k2');
    });

    it('o mesmo aparelho migra para quem está logado agora', async () => {
      await servico.subscribe(PROF, { endpoint, keys: { p256dh: 'k1', auth: 'a1' } });
      await servico.subscribe(OUTRO, { endpoint, keys: { p256dh: 'k1', auth: 'a1' } });

      // Ela testa numa conta, empresta o celular, reinstala. Se a subscription
      // não seguisse o dono, o alarme de uma iria para o aparelho da outra.
      expect(await prisma.pushSubscription.count({ where: { professorId: PROF } })).toBe(0);
      expect(await prisma.pushSubscription.count({ where: { professorId: OUTRO } })).toBe(1);
    });

    it('não deixa um professor descadastrar o device de outro', async () => {
      await servico.subscribe(PROF, { endpoint, keys: { p256dh: 'k1', auth: 'a1' } });

      await servico.unsubscribe(OUTRO, endpoint);

      expect(await prisma.pushSubscription.count({ where: { endpoint } })).toBe(1);
    });
  });
});
