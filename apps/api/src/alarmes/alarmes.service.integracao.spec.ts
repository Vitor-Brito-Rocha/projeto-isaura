import { IntensidadeAlarme, PrismaClient, StatusOcorrencia } from '@prisma/client';
import type { ErrosService } from '../common/erros.service';
import { PrismaService } from '../prisma/prisma.service';
import type { PushPayload, PushService } from '../push/push.service';
import {
  AlarmesService,
  TOLERANCIA_ABERTURA_MIN,
  TOLERANCIA_FECHAMENTO_MIN,
} from './alarmes.service';

/**
 * Ver o cabeçalho de series.service.integracao.spec.ts para como rodar.
 *
 * Os crons recebem `agora` como parâmetro em vez de chamarem `new Date()` por
 * dentro — é o que permite testar as janelas de tolerância movendo o relógio,
 * sem mock global de Date (que costuma quebrar o driver do Postgres junto).
 *
 * As asserções contam os pushes DESTE professor, não o retorno do cron. Os
 * crons são multitenant por construção: varrem as ocorrências de todo mundo num
 * `findMany` só, sem laço por conta. Isso é o comportamento certo em produção, e
 * significa que outro arquivo de teste rodando em paralelo no mesmo banco entra
 * na contagem — o retorno do cron não é um número isolável.
 */
const url = process.env.TEST_DATABASE_URL;
const descreve = url ? describe : describe.skip;

const MIN = 60_000;

descreve('AlarmesService (integração)', () => {
  let prisma: PrismaService;
  let servico: AlarmesService;
  let enviados: Array<{ professorId: string; payload: PushPayload }>;

  const PROF = 'prof-alarmes';
  let cadeiraId: string;

  /** Só o que foi para este professor — ver nota sobre paralelismo acima. */
  const meus = () => enviados.filter((e) => e.professorId === PROF);

  // Dublê: registra o que teria sido enviado. O envio real depende de VAPID e
  // de um endpoint de push vivo — nada disso é o que este teste está checando.
  const pushFalso = {
    enviarPush: async (professorId: string, payload: PushPayload) => {
      enviados.push({ professorId, payload });
      return 1;
    },
  } as unknown as PushService;

  // Dublê: o que interessa aqui é o alarme, não a trilha de erro. Registrar de
  // verdade gravaria em erros_log a cada rodada de teste.
  const errosFalso = {
    registrar: async () => undefined,
  } as unknown as ErrosService;

  beforeAll(() => {
    prisma = new PrismaClient({ datasources: { db: { url } } }) as unknown as PrismaService;
    servico = new AlarmesService(prisma, pushFalso, errosFalso);
  });

  afterAll(async () => {
    await prisma.professor.deleteMany({ where: { id: PROF } });
    await (prisma as unknown as PrismaClient).$disconnect();
  });

  beforeEach(async () => {
    enviados = [];
    await prisma.professor.deleteMany({ where: { id: PROF } });
    await prisma.professor.create({
      data: {
        id: PROF,
        nome: 'Isaura',
        email: 'alarmes@teste.dev',
        timezone: 'America/Sao_Paulo',
        antecedenciaPadraoMin: 5,
        atrasoPadraoMin: 5,
      },
    });
    const cadeira = await prisma.cadeira.create({
      data: { professorId: PROF, disciplina: 'Matemática', turma: '8º A', anoLetivo: 2026 },
    });
    cadeiraId = cadeira.id;
  });

  const AGORA = new Date('2026-09-10T12:00:00.000Z');

  /** Cria uma aula que começa daqui a `emMin` minutos e dura 50. */
  async function aulaDaqui(emMin: number) {
    const inicioEm = new Date(AGORA.getTime() + emMin * MIN);
    return prisma.ocorrencia.create({
      data: {
        professorId: PROF,
        cadeiraId,
        data: new Date('2026-09-10T00:00:00.000Z'),
        horaInicio: '07:00',
        horaFim: '07:50',
        inicioEm,
        fimEm: new Date(inicioEm.getTime() + 50 * MIN),
      },
    });
  }

  describe('abertura', () => {
    it('dispara quando chega a antecedência configurada', async () => {
      await aulaDaqui(5); // antecedência padrão = 5 min → é agora

      await servico.alarmeAbertura(AGORA);

      expect(meus()).toHaveLength(1);
      expect(meus()[0].payload.tipo).toBe('ABERTURA_AULA');
      expect(meus()[0].payload.body).toContain('planeja dar');
      // A hora no corpo é a de parede da professora, não UTC.
      expect(meus()[0].payload.body).toContain('09:05');
    });

    it('não dispara antes da hora', async () => {
      await aulaDaqui(30); // falta muito para os 5 min de antecedência

      await servico.alarmeAbertura(AGORA);

      expect(meus()).toHaveLength(0);
      // E a marca continua nula, para disparar no tick certo mais tarde.
      const oc = await prisma.ocorrencia.findFirstOrThrow({ where: { professorId: PROF } });
      expect(oc.aberturaNotificadaEm).toBeNull();
    });

    it('não dispara alarme atrasado demais', async () => {
      // Aula começou há muito tempo. Perguntar "o que você planeja dar?" no meio
      // dela é pior que silêncio.
      await aulaDaqui(-(TOLERANCIA_ABERTURA_MIN + 10));

      await servico.alarmeAbertura(AGORA);

      expect(meus()).toHaveLength(0);
    });

    it('ainda dispara dentro da tolerância', async () => {
      await aulaDaqui(-(TOLERANCIA_ABERTURA_MIN - 10));

      await servico.alarmeAbertura(AGORA);

      expect(meus()).toHaveLength(1);
    });

    it('não redispara depois de enviado', async () => {
      await aulaDaqui(5);

      await servico.alarmeAbertura(AGORA);
      await servico.alarmeAbertura(AGORA);

      expect(meus()).toHaveLength(1);
    });

    it('ignora aula cancelada', async () => {
      const oc = await aulaDaqui(5);
      await prisma.ocorrencia.update({
        where: { id: oc.id },
        data: { status: StatusOcorrencia.CANCELADA },
      });

      await servico.alarmeAbertura(AGORA);

      expect(meus()).toHaveLength(0);
    });
  });

  describe('fechamento', () => {
    it('dispara depois do atraso configurado', async () => {
      await aulaDaqui(-55); // terminou há 5 min (atraso padrão) → é agora

      await servico.alarmeFechamento(AGORA);

      expect(meus()).toHaveLength(1);
      expect(meus()[0].payload.tipo).toBe('FECHAMENTO_AULA');
      expect(meus()[0].payload.body).toContain('O que você deu?');
    });

    it('não dispara com a aula ainda em andamento', async () => {
      await aulaDaqui(-10); // começou há 10 min, termina daqui a 40

      await servico.alarmeFechamento(AGORA);

      expect(meus()).toHaveLength(0);
    });

    it('tolera atraso muito maior que a abertura', async () => {
      // Registrar a aula duas horas depois ainda é útil — ela pode fazer isso no
      // intervalo, no fim do turno, no ônibus. É o motivo de as tolerâncias
      // serem assimétricas.
      const atrasoQueMataAbertura = TOLERANCIA_ABERTURA_MIN + 60;
      await aulaDaqui(-(50 + atrasoQueMataAbertura));

      await servico.alarmeFechamento(AGORA);

      expect(meus()).toHaveLength(1);
    });

    it('desiste depois da tolerância de fechamento', async () => {
      await aulaDaqui(-(50 + TOLERANCIA_FECHAMENTO_MIN + 30));

      await servico.alarmeFechamento(AGORA);

      expect(meus()).toHaveLength(0);
    });
  });

  describe('config por cadeira', () => {
    it('override de antecedência ganha do padrão da conta', async () => {
      await prisma.configAlarme.create({
        data: { professorId: PROF, cadeiraId, antecedenciaMin: 20 },
      });
      await aulaDaqui(20); // com antecedência 20, o alarme é exatamente agora

      await servico.alarmeAbertura(AGORA);

      expect(meus()).toHaveLength(1);
    });

    it('sem o override, a mesma aula ainda não dispararia', async () => {
      // Mesmo cenário do teste acima, só que herdando os 5 min da conta: faltam
      // 15 minutos para o alarme. É o par que prova que o override é a causa.
      await aulaDaqui(20);

      await servico.alarmeAbertura(AGORA);

      expect(meus()).toHaveLength(0);
    });

    it('SILENCIOSO segue o caminho normal — quem decide não tocar é o PushService', async () => {
      await prisma.configAlarme.create({
        data: { professorId: PROF, cadeiraId, intensidadeAbertura: IntensidadeAlarme.SILENCIOSO },
      });
      await aulaDaqui(5);

      await servico.alarmeAbertura(AGORA);

      // O cron não filtra intensidade: ele repassa. Concentrar essa decisão no
      // PushService é o que garante que a Notificacao in-app é gravada mesmo
      // quando nada toca (ver push.service.integracao.spec.ts).
      expect(meus()[0].payload.intensidade).toBe(IntensidadeAlarme.SILENCIOSO);
    });
  });

  describe('claim atômico', () => {
    it('dois ticks simultâneos enviam um push só', async () => {
      await aulaDaqui(5);

      // O caso real é um deploy no meio do minuto: instância velha e nova
      // varrendo a mesma linha ao mesmo tempo. Duplicar treina a professora a
      // ignorar o alarme, que é o pior desfecho possível deste produto.
      await Promise.all([servico.alarmeAbertura(AGORA), servico.alarmeAbertura(AGORA)]);

      expect(meus()).toHaveLength(1);
    });

    it('abertura e fechamento têm marcas independentes', async () => {
      await aulaDaqui(-55); // fechamento vence agora; a abertura já passou há muito

      await servico.alarmeFechamento(AGORA);
      const oc = await prisma.ocorrencia.findFirstOrThrow({ where: { professorId: PROF } });

      expect(oc.fechamentoNotificadoEm).not.toBeNull();
      expect(oc.aberturaNotificadaEm).toBeNull();
    });
  });
});
