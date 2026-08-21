import { PrismaClient, StatusOcorrencia } from '@prisma/client';
import { urlDeTeste } from '../common/teste-db';
import { PrismaService } from '../prisma/prisma.service';
import { CadeirasService } from './cadeiras.service';

/**
 * Teste de integração contra um Postgres real. Pulado sem `TEST_DATABASE_URL`.
 *
 * O que ele cobre e o teste unitário não conseguiria: o `distinct` do Prisma e
 * o filtro por professor acontecem no banco, então a deduplicação e o isolamento
 * entre contas só provam alguma coisa contra o banco de verdade.
 */
const url = urlDeTeste();
const descreve = url ? describe : describe.skip;

descreve('CadeirasService.disciplinas (integração)', () => {
  let prisma: PrismaService;
  let servico: CadeirasService;

  const ISAURA = 'prof-disciplinas-a';
  const OUTRA = 'prof-disciplinas-b';

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url } } }) as unknown as PrismaService;
    servico = new CadeirasService(prisma);
  });

  afterAll(async () => {
    await (prisma as unknown as PrismaClient).$disconnect();
  });

  beforeEach(async () => {
    await prisma.professor.deleteMany({ where: { id: { in: [ISAURA, OUTRA] } } });
    await prisma.professor.createMany({
      data: [
        { id: ISAURA, nome: 'Isaura', email: 'disc-a@teste.dev' },
        { id: OUTRA, nome: 'Rita', email: 'disc-b@teste.dev' },
      ],
    });
  });

  it('devolve cada disciplina uma vez, em ordem', async () => {
    await prisma.cadeira.createMany({
      data: [
        { professorId: ISAURA, disciplina: 'Matemática', turma: '8º A', anoLetivo: 2026 },
        { professorId: ISAURA, disciplina: 'Matemática', turma: '8º B', anoLetivo: 2026 },
        { professorId: ISAURA, disciplina: 'Física', turma: '9º A', anoLetivo: 2026 },
      ],
    });

    expect(await servico.disciplinas(ISAURA)).toEqual(['Física', 'Matemática']);
  });

  it('junta as grafias que só diferem em acento, e mantém a primeira', async () => {
    await prisma.cadeira.createMany({
      data: [
        { professorId: ISAURA, disciplina: 'Matemática', turma: '8º A', anoLetivo: 2026 },
        { professorId: ISAURA, disciplina: 'matematica', turma: '8º B', anoLetivo: 2026 },
      ],
    });

    // Uma sugestão só. Devolver as duas ofereceria à professora exatamente o
    // erro que a sugestão existe para evitar.
    expect(await servico.disciplinas(ISAURA)).toEqual(['Matemática']);
  });

  it('inclui a disciplina do plano e a da cadeira inativa', async () => {
    await prisma.cadeira.create({
      data: {
        professorId: ISAURA,
        disciplina: 'História',
        turma: '7º A',
        anoLetivo: 2025,
        ativo: false,
      },
    });
    await prisma.planoCurricular.create({
      data: { professorId: ISAURA, nome: 'Química 1º ano', disciplina: 'Química', anoLetivo: 2026 },
    });

    // Semestre passado continua sendo a grafia certa deste semestre.
    expect(await servico.disciplinas(ISAURA)).toEqual(['História', 'Química']);
  });

  it('não vaza a disciplina de outra conta', async () => {
    await prisma.cadeira.create({
      data: { professorId: OUTRA, disciplina: 'Geografia', turma: '6º A', anoLetivo: 2026 },
    });

    expect(await servico.disciplinas(ISAURA)).toEqual([]);
    expect(await servico.disciplinas(OUTRA)).toEqual(['Geografia']);
  });
});

/**
 * Arquivar uma turma tem de calar o alarme dela, e é a única parte que não dá
 * para provar sem banco: o varredor de alarmes acha as ocorrências por
 * `status` e `inicioEm`, e nunca por `cadeira.ativo`. Um `ativo: false`
 * sozinho tirava a turma da tela e deixava os dois pushes tocando pelo resto do
 * semestre — a turma some, o alarme fica, e não sobra nada na tela que explique
 * de onde ele vem.
 */
descreve('CadeirasService.desativar (integração)', () => {
  let prisma: PrismaService;
  let servico: CadeirasService;

  const PROF = 'prof-arquivar';
  const DIA = 24 * 60 * 60 * 1000;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url } } }) as unknown as PrismaService;
    servico = new CadeirasService(prisma);
  });

  afterAll(async () => {
    await (prisma as unknown as PrismaClient).$disconnect();
  });

  beforeEach(async () => {
    await prisma.professor.deleteMany({ where: { id: PROF } });
    await prisma.professor.create({
      data: { id: PROF, nome: 'Isaura', email: 'arquivar@teste.dev' },
    });
  });

  function aula(cadeiraId: string, quando: number) {
    const inicioEm = new Date(quando);
    return {
      professorId: PROF,
      cadeiraId,
      data: new Date(`${inicioEm.toISOString().slice(0, 10)}T00:00:00.000Z`),
      horaInicio: '11:20',
      horaFim: '13:00',
      inicioEm,
      fimEm: new Date(quando + 100 * 60 * 1000),
      status: StatusOcorrencia.AGENDADA,
    };
  }

  async function turmaComAulas() {
    const cadeira = await prisma.cadeira.create({
      data: { professorId: PROF, disciplina: 'Cálculo I', turma: 'primeiro ano', anoLetivo: 2026 },
    });
    const agora = Date.now();
    await prisma.ocorrencia.createMany({
      data: [
        aula(cadeira.id, agora - 3 * DIA),
        aula(cadeira.id, agora + 2 * DIA),
        aula(cadeira.id, agora + 9 * DIA),
      ],
    });
    return cadeira;
  }

  it('cancela as aulas futuras e não encosta na que já passou', async () => {
    const cadeira = await turmaComAulas();

    expect(await servico.desativar(PROF, cadeira.id)).toEqual({ ok: true, aulasCanceladas: 2 });

    const aulas = await prisma.ocorrencia.findMany({
      where: { cadeiraId: cadeira.id },
      orderBy: { inicioEm: 'asc' },
    });
    // A passada continua AGENDADA de propósito: ela pode ter registro, e mudar
    // o status tiraria do progresso e da exportação o que ela de fato deu.
    expect(aulas.map((a) => a.status)).toEqual([
      StatusOcorrencia.AGENDADA,
      StatusOcorrencia.CANCELADA,
      StatusOcorrencia.CANCELADA,
    ]);
  });

  it('marca as duas notificações das canceladas, como o cancelamento pela tela', async () => {
    // Dois caminhos de cancelamento que deixam a linha em estados diferentes é
    // como nasce um "cancelei e o alarme tocou assim mesmo".
    const cadeira = await turmaComAulas();
    await servico.desativar(PROF, cadeira.id);

    const canceladas = await prisma.ocorrencia.findMany({
      where: { cadeiraId: cadeira.id, status: StatusOcorrencia.CANCELADA },
    });

    expect(canceladas).toHaveLength(2);
    expect(canceladas.every((a) => a.aberturaNotificadaEm !== null)).toBe(true);
    expect(canceladas.every((a) => a.fechamentoNotificadoEm !== null)).toBe(true);
  });

  it('desativa a cadeira e as séries dela, e não toca em outra turma', async () => {
    const cadeira = await turmaComAulas();
    const outra = await prisma.cadeira.create({
      data: { professorId: PROF, disciplina: 'Física', turma: '9º A', anoLetivo: 2026 },
    });
    await prisma.ocorrencia.create({ data: aula(outra.id, Date.now() + 2 * DIA) });
    await prisma.serieAula.create({
      data: { professorId: PROF, cadeiraId: cadeira.id, frequencia: 'SEMANAL', dataInicio: new Date('2026-08-04T00:00:00.000Z') },
    });

    await servico.desativar(PROF, cadeira.id);

    expect((await prisma.cadeira.findUniqueOrThrow({ where: { id: cadeira.id } })).ativo).toBe(false);
    expect((await prisma.serieAula.findFirst({ where: { cadeiraId: cadeira.id } }))!.ativo).toBe(false);

    const daOutra = await prisma.ocorrencia.findFirstOrThrow({ where: { cadeiraId: outra.id } });
    expect(daOutra.status).toBe(StatusOcorrencia.AGENDADA);
    expect((await prisma.cadeira.findUniqueOrThrow({ where: { id: outra.id } })).ativo).toBe(true);
  });
});
