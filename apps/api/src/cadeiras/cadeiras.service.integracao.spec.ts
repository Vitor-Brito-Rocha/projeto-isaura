import { PrismaClient } from '@prisma/client';
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
