import { PrismaClient, TipoAnexo } from '@prisma/client';
import { urlDeTeste } from '../common/teste-db';
import { PrismaService } from '../prisma/prisma.service';
import { AnexosService } from './anexos.service';
import type { StorageService } from './storage.service';

/**
 * Teste de integração contra um Postgres real. Pulado sem `TEST_DATABASE_URL`.
 *
 * O Storage fica **inativo** de propósito: o que precisa de prova aqui é o
 * banco — que um anexo pendura numa aula OU num plano, que um acervo não
 * enxerga o outro, e que o CHECK recusa a linha sem dono. Subir arquivo de
 * verdade a cada rodada encheria o bucket e testaria a rede, não o modelo.
 */
const url = urlDeTeste();
const descreve = url ? describe : describe.skip;

/** `ativo: false` faz `listarDe` devolver `url: null` sem tocar na rede. */
const storageInativo = { ativo: false } as unknown as StorageService;

descreve('AnexosService — anexo de plano (integração)', () => {
  let prisma: PrismaService;
  let servico: AnexosService;

  const ISAURA = 'prof-anexos-a';
  const OUTRA = 'prof-anexos-b';

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url } } }) as unknown as PrismaService;
    servico = new AnexosService(prisma, storageInativo);
  });

  afterAll(async () => {
    await (prisma as unknown as PrismaClient).$disconnect();
  });

  beforeEach(async () => {
    await prisma.professor.deleteMany({ where: { id: { in: [ISAURA, OUTRA] } } });
    await prisma.professor.createMany({
      data: [
        { id: ISAURA, nome: 'Isaura', email: 'anexo-a@teste.dev' },
        { id: OUTRA, nome: 'Rita', email: 'anexo-b@teste.dev' },
      ],
    });
  });

  const criarPlano = (professorId: string) =>
    prisma.planoCurricular.create({
      data: { professorId, nome: 'Matemática 8º ano', anoLetivo: 2026 },
    });

  const anexarAoPlano = (professorId: string, planoCurricularId: string, nome: string) =>
    prisma.anexo.create({
      data: {
        professorId,
        planoCurricularId,
        tipo: TipoAnexo.FOTO,
        nomeArquivo: nome,
        storagePath: `${professorId}/planos/${planoCurricularId}/${nome}`,
      },
    });

  it('guarda um anexo pendurado no plano, sem aula nenhuma', async () => {
    const plano = await criarPlano(ISAURA);
    await anexarAoPlano(ISAURA, plano.id, 'plano-pagina-1.jpg');

    const lista = await servico.listarDoPlano(ISAURA, plano.id);

    expect(lista).toHaveLength(1);
    expect(lista[0].nomeArquivo).toBe('plano-pagina-1.jpg');
    // Storage inativo não inventa link: melhor nome sem URL do que URL quebrada.
    expect(lista[0].url).toBeNull();
  });

  it('aceita várias páginas do mesmo documento, em ordem de envio', async () => {
    const plano = await criarPlano(ISAURA);
    await anexarAoPlano(ISAURA, plano.id, 'pagina-1.jpg');
    await anexarAoPlano(ISAURA, plano.id, 'pagina-2.jpg');

    // Plano escrito à mão costuma ter mais de uma folha, e o teto de 10 MB é
    // por arquivo — a tela promete "uma página por vez".
    expect((await servico.listarDoPlano(ISAURA, plano.id)).map((a) => a.nomeArquivo)).toEqual([
      'pagina-1.jpg',
      'pagina-2.jpg',
    ]);
  });

  it('não deixa ver o documento do plano de outra conta', async () => {
    const plano = await criarPlano(OUTRA);
    await anexarAoPlano(OUTRA, plano.id, 'plano-da-rita.jpg');

    // A FK confere existência, não dono: sem o filtro por professor, um uuid
    // vazado daria acesso de leitura ao documento de outra professora.
    await expect(servico.listarDoPlano(ISAURA, plano.id)).rejects.toThrow(
      'Plano de curso não encontrado.',
    );
  });

  it('o CHECK do banco recusa anexo sem dono', async () => {
    // O Prisma não sabe expressar "exatamente um dono", então a garantia é do
    // banco. Sem ela, um bug produziria anexo invisível nas duas telas e
    // ocupando espaço no bucket para sempre.
    await expect(
      prisma.anexo.create({
        data: {
          professorId: ISAURA,
          tipo: TipoAnexo.DOCUMENTO,
          nomeArquivo: 'orfao.pdf',
          storagePath: `${ISAURA}/orfao.pdf`,
        },
      }),
    ).rejects.toThrow();
  });

  it('apagar o plano leva o documento junto (cascade)', async () => {
    const plano = await criarPlano(ISAURA);
    await anexarAoPlano(ISAURA, plano.id, 'some-comigo.jpg');

    await prisma.planoCurricular.delete({ where: { id: plano.id } });

    expect(await prisma.anexo.count({ where: { professorId: ISAURA } })).toBe(0);
  });
});
