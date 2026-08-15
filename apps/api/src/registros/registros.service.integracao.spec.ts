import { PrismaClient } from '@prisma/client';
import { PlanosService } from '../planos/planos.service';
import { PrismaService } from '../prisma/prisma.service';
import { RegistrosService } from './registros.service';

/**
 * Teste de integração contra um Postgres real.
 *
 * Pulado quando `TEST_DATABASE_URL` não está definido. Para rodar:
 *
 *   TEST_DATABASE_URL=<session pooler> npm run test:api
 *
 * O que ele cobre e um teste unitário não conseguiria: que o plano curricular
 * é COMPARTILHADO entre turmas irmãs (a razão de ele ter saído da cadeira), que
 * a sugestão da aula anterior encadeia de verdade pelo banco, e que nenhum id
 * de outra conta atravessa — inclusive em `registros_topicos`, que não tem
 * `professorId` próprio.
 */
const url = process.env.TEST_DATABASE_URL;
const descreve = url ? describe : describe.skip;

descreve('RegistrosService (integração)', () => {
  let prisma: PrismaService;
  let registros: RegistrosService;
  let planos: PlanosService;

  const PROF = 'prof-registros';
  const OUTRO = 'prof-registros-outro';

  let planoId: string;
  let unidadeId: string;
  let topicoId: string;
  let cadeiraA: string;
  let cadeiraB: string;

  const MIN = 60_000;
  const BASE = new Date('2026-04-06T12:00:00.000Z');

  beforeAll(() => {
    prisma = new PrismaClient({ datasources: { db: { url } } }) as unknown as PrismaService;
    registros = new RegistrosService(prisma);
    planos = new PlanosService(prisma);
  });

  afterAll(async () => {
    await prisma.professor.deleteMany({ where: { id: { in: [PROF, OUTRO] } } });
    await (prisma as unknown as PrismaClient).$disconnect();
  });

  beforeEach(async () => {
    await prisma.professor.deleteMany({ where: { id: { in: [PROF, OUTRO] } } });
    for (const id of [PROF, OUTRO]) {
      await prisma.professor.create({
        data: { id, nome: id, email: `${id}@teste.dev`, timezone: 'America/Sao_Paulo' },
      });
    }

    const plano = await planos.criar(PROF, { nome: 'Matemática 8º', anoLetivo: 2026 });
    planoId = plano.id;
    const unidade = await planos.criarUnidade(PROF, planoId, { titulo: 'Unidade 1' });
    unidadeId = unidade.id;
    const topico = await planos.criarTopico(PROF, planoId, unidadeId, { titulo: 'Frações' });
    topicoId = topico.id;

    // Duas turmas IRMÃS: disciplinas iguais, plano curricular compartilhado.
    const a = await prisma.cadeira.create({
      data: {
        professorId: PROF,
        disciplina: 'Matemática',
        turma: '8º A',
        anoLetivo: 2026,
        planoCurricularId: planoId,
      },
    });
    const b = await prisma.cadeira.create({
      data: {
        professorId: PROF,
        disciplina: 'Matemática',
        turma: '8º B',
        anoLetivo: 2026,
        planoCurricularId: planoId,
      },
    });
    cadeiraA = a.id;
    cadeiraB = b.id;
  });

  /** Cria uma aula na cadeira dada, deslocada de `emMin` da base. */
  async function aula(cadeiraId: string, emMin: number) {
    const inicioEm = new Date(BASE.getTime() + emMin * MIN);
    return prisma.ocorrencia.create({
      data: {
        professorId: PROF,
        cadeiraId,
        data: new Date('2026-04-06T00:00:00.000Z'),
        horaInicio: '07:00',
        horaFim: '07:50',
        inicioEm,
        fimEm: new Date(inicioEm.getTime() + 50 * MIN),
      },
    });
  }

  describe('ordenação automática', () => {
    it('unidade e tópico novos vão para o fim da lista', async () => {
      const u2 = await planos.criarUnidade(PROF, planoId, { titulo: 'Unidade 2' });
      const t2 = await planos.criarTopico(PROF, planoId, unidadeId, { titulo: 'Decimais' });

      expect(u2.ordem).toBe(2);
      expect(t2.ordem).toBe(2);
    });
  });

  describe('contexto da tela /aula/[id]', () => {
    it('traz as unidades do plano da cadeira', async () => {
      const oc = await aula(cadeiraA, 0);

      const ctx = await registros.contexto(PROF, oc.id);

      expect(ctx.unidades).toHaveLength(1);
      expect(ctx.unidades[0].topicos[0].titulo).toBe('Frações');
    });

    it('sugere o planoProximaAula da aula anterior da MESMA cadeira', async () => {
      const anterior = await aula(cadeiraA, -7 * 24 * 60);
      await registros.salvarFechamento(PROF, anterior.id, {
        conteudoDado: 'Terminei frações equivalentes',
        planoProximaAula: 'Começar soma de frações',
      });
      const hoje = await aula(cadeiraA, 0);

      const ctx = await registros.contexto(PROF, hoje.id);

      expect(ctx.sugestoes.daAulaAnterior?.texto).toBe('Começar soma de frações');
    });

    it('sugere o que foi dado na turma irmã que segue o mesmo plano', async () => {
      const noA = await aula(cadeiraA, -2 * 24 * 60);
      await registros.salvarFechamento(PROF, noA.id, {
        conteudoDado: 'Frações equivalentes, exercícios 1 a 8',
        unidadeId,
      });
      const noB = await aula(cadeiraB, 0);

      const ctx = await registros.contexto(PROF, noB.id);

      expect(ctx.sugestoes.daTurmaIrma?.turma).toBe('8º A');
      expect(ctx.sugestoes.daTurmaIrma?.texto).toContain('Frações equivalentes');
    });

    it('não sugere turma irmã quando as cadeiras não compartilham plano', async () => {
      await prisma.cadeira.update({
        where: { id: cadeiraB },
        data: { planoCurricularId: null },
      });
      const noA = await aula(cadeiraA, -2 * 24 * 60);
      await registros.salvarFechamento(PROF, noA.id, { conteudoDado: 'Frações' });
      const noB = await aula(cadeiraB, 0);

      const ctx = await registros.contexto(PROF, noB.id);

      expect(ctx.sugestoes.daTurmaIrma).toBeNull();
    });
  });

  describe('fechamento', () => {
    it('substitui a lista de tópicos por inteiro', async () => {
      const outro = await planos.criarTopico(PROF, planoId, unidadeId, { titulo: 'Decimais' });
      const oc = await aula(cadeiraA, 0);

      await registros.salvarFechamento(PROF, oc.id, { topicosCobertos: [topicoId, outro.id] });
      const depois = await registros.salvarFechamento(PROF, oc.id, {
        topicosCobertos: [outro.id],
      });

      expect(depois.topicos).toHaveLength(1);
      expect(depois.topicos[0].topicoId).toBe(outro.id);
    });

    it('cria o registro na primeira gravação e edita na segunda', async () => {
      const oc = await aula(cadeiraA, 0);

      const primeiro = await registros.salvarAbertura(PROF, oc.id, { planoPrevisto: 'Frações' });
      const segundo = await registros.salvarFechamento(PROF, oc.id, { conteudoDado: 'Deu certo' });

      expect(segundo.id).toBe(primeiro.id);
      expect(segundo.planoPrevisto).toBe('Frações');
      expect(segundo.conteudoDado).toBe('Deu certo');
    });
  });

  describe('isolamento entre contas', () => {
    it('não abre a aula de outro professor', async () => {
      const oc = await aula(cadeiraA, 0);

      await expect(registros.contexto(OUTRO, oc.id)).rejects.toThrow();
    });

    it('recusa um tópico de outra conta no fechamento', async () => {
      const planoAlheio = await planos.criar(OUTRO, { nome: 'Alheio', anoLetivo: 2026 });
      const unidadeAlheia = await planos.criarUnidade(OUTRO, planoAlheio.id, { titulo: 'U' });
      const topicoAlheio = await planos.criarTopico(OUTRO, planoAlheio.id, unidadeAlheia.id, {
        titulo: 'T',
      });
      const oc = await aula(cadeiraA, 0);

      // A FK aceitaria: ela confere existência, não dono. A barreira é a guarda.
      await expect(
        registros.salvarFechamento(PROF, oc.id, { topicosCobertos: [topicoAlheio.id] }),
      ).rejects.toThrow();
    });

    it('não deixa o plano de outro professor ser lido', async () => {
      await expect(planos.buscar(OUTRO, planoId)).rejects.toThrow();
    });
  });
});
