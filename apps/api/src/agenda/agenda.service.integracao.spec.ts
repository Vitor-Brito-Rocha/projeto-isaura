import { PrismaClient, StatusOcorrencia } from '@prisma/client';
import { instanteDeParede } from '../common/tz';
import { PrismaService } from '../prisma/prisma.service';
import { AgendaService } from './agenda.service';
import { urlDeTeste } from '../common/teste-db';

/**
 * Ver o cabeçalho de series.service.integracao.spec.ts para como rodar.
 *
 * O foco aqui é o par cancelar/reativar, que mexe nas marcas de reivindicação
 * do cron. É a lógica onde um erro não aparece na tela: a aula fica lá, bonita
 * na grade, e só o alarme nunca vem.
 */
const url = urlDeTeste();
const descreve = url ? describe : describe.skip;

descreve('AgendaService (integração)', () => {
  let prisma: PrismaService;
  let servico: AgendaService;

  const PROF = 'prof-agenda';
  const OUTRO = 'prof-agenda-outro';
  let ocorrenciaId: string;

  beforeAll(() => {
    prisma = new PrismaClient({ datasources: { db: { url } } }) as unknown as PrismaService;
    servico = new AgendaService(prisma);
  });

  afterAll(async () => {
    await prisma.professor.deleteMany({ where: { id: { in: [PROF, OUTRO] } } });
    await (prisma as unknown as PrismaClient).$disconnect();
  });

  beforeEach(async () => {
    await prisma.professor.deleteMany({ where: { id: { in: [PROF, OUTRO] } } });
    await prisma.professor.createMany({
      data: [
        { id: PROF, nome: 'Isaura', email: 'agenda@teste.dev', timezone: 'America/Sao_Paulo' },
        { id: OUTRO, nome: 'Outro', email: 'outro@teste.dev', timezone: 'America/Sao_Paulo' },
      ],
    });

    const cadeira = await prisma.cadeira.create({
      data: { professorId: PROF, disciplina: 'História', turma: '9º B', anoLetivo: 2026 },
    });
    const oc = await prisma.ocorrencia.create({
      data: {
        professorId: PROF,
        cadeiraId: cadeira.id,
        data: new Date('2026-09-10T00:00:00.000Z'),
        horaInicio: '07:00',
        horaFim: '07:50',
        inicioEm: instanteDeParede('2026-09-10', '07:00', 'America/Sao_Paulo'),
        fimEm: instanteDeParede('2026-09-10', '07:50', 'America/Sao_Paulo'),
      },
    });
    ocorrenciaId = oc.id;
  });

  it('cancelar silencia os dois alarmes', async () => {
    await servico.atualizar(PROF, ocorrenciaId, { status: StatusOcorrencia.CANCELADA });

    const oc = await prisma.ocorrencia.findUniqueOrThrow({ where: { id: ocorrenciaId } });
    expect(oc.aberturaNotificadaEm).not.toBeNull();
    expect(oc.fechamentoNotificadoEm).not.toBeNull();
  });

  it('feriado silencia os dois alarmes', async () => {
    await servico.atualizar(PROF, ocorrenciaId, { status: StatusOcorrencia.FERIADO });

    const oc = await prisma.ocorrencia.findUniqueOrThrow({ where: { id: ocorrenciaId } });
    expect(oc.aberturaNotificadaEm).not.toBeNull();
    expect(oc.fechamentoNotificadoEm).not.toBeNull();
  });

  it('reativar devolve os alarmes', async () => {
    await servico.atualizar(PROF, ocorrenciaId, { status: StatusOcorrencia.FERIADO });
    await servico.atualizar(PROF, ocorrenciaId, { status: StatusOcorrencia.AGENDADA });

    // Sem este comportamento, marcar feriado por engano e desfazer deixaria a
    // aula na grade com os dois alarmes silenciados para sempre.
    const oc = await prisma.ocorrencia.findUniqueOrThrow({ where: { id: ocorrenciaId } });
    expect(oc.status).toBe(StatusOcorrencia.AGENDADA);
    expect(oc.aberturaNotificadaEm).toBeNull();
    expect(oc.fechamentoNotificadoEm).toBeNull();
  });

  it('editar só a observação não mexe nas marcas de alarme', async () => {
    const marca = new Date('2026-09-01T00:00:00.000Z');
    await prisma.ocorrencia.update({
      where: { id: ocorrenciaId },
      data: { aberturaNotificadaEm: marca },
    });

    await servico.atualizar(PROF, ocorrenciaId, { observacao: 'sala trocada para o laboratório' });

    const oc = await prisma.ocorrencia.findUniqueOrThrow({ where: { id: ocorrenciaId } });
    expect(oc.observacao).toBe('sala trocada para o laboratório');
    expect(oc.aberturaNotificadaEm?.toISOString()).toBe(marca.toISOString());
  });

  it('não deixa um professor editar a aula de outro', async () => {
    await expect(
      servico.atualizar(OUTRO, ocorrenciaId, { status: StatusOcorrencia.CANCELADA }),
    ).rejects.toThrow('Aula não encontrada.');

    const oc = await prisma.ocorrencia.findUniqueOrThrow({ where: { id: ocorrenciaId } });
    expect(oc.status).toBe(StatusOcorrencia.AGENDADA);
  });

  /**
   * O caminho de "não deu para escrever na hora, lembrei depois".
   *
   * Gravar nunca teve janela de tempo; o que faltava era achar a aula sem
   * lembrar a data. Estes testes travam quem entra e quem não entra na lista —
   * errar para mais transforma a tela num monte de ruído que ela ignora, e
   * errar para menos some com a aula que ela precisava registrar.
   */
  describe('pendencias', () => {
    const DIA = 86_400_000;

    /** Aula terminada há `haDias`, na cadeira de PROF. */
    async function aulaPassada(haDias: number, dono = PROF) {
      const cadeira = await prisma.cadeira.create({
        data: { professorId: dono, disciplina: 'Geografia', turma: '7º C', anoLetivo: 2026 },
      });
      const fim = new Date(Date.now() - haDias * DIA);
      return prisma.ocorrencia.create({
        data: {
          professorId: dono,
          cadeiraId: cadeira.id,
          data: new Date('2026-01-01T00:00:00.000Z'),
          horaInicio: '07:00',
          horaFim: '07:50',
          inicioEm: new Date(fim.getTime() - 50 * 60_000),
          fimEm: fim,
        },
      });
    }

    const idsDe = async (dias = 45) =>
      (await servico.pendencias(PROF, dias)).map((o) => o.id);

    it('lista a aula que terminou sem nada escrito', async () => {
      const oc = await aulaPassada(3);

      expect(await idsDe()).toContain(oc.id);
    });

    it('some assim que o conteúdo é escrito', async () => {
      const oc = await aulaPassada(3);
      await prisma.registroAula.create({
        data: { professorId: PROF, ocorrenciaId: oc.id, conteudoDado: 'Relevo do Brasil' },
      });

      expect(await idsDe()).not.toContain(oc.id);
    });

    it('registro só com plano previsto ainda é pendência', async () => {
      // Ela respondeu o alarme de abertura e não voltou no fechamento: é
      // exatamente a aula que corre risco de ficar sem registro nenhum.
      const oc = await aulaPassada(3);
      await prisma.registroAula.create({
        data: { professorId: PROF, ocorrenciaId: oc.id, planoPrevisto: 'Relevo' },
      });

      expect(await idsDe()).toContain(oc.id);
    });

    it('não lista aula que ainda não terminou', async () => {
      const futura = await prisma.ocorrencia.findFirstOrThrow({ where: { id: ocorrenciaId } });

      expect(await idsDe(365)).not.toContain(futura.id);
    });

    it('não lista cancelada nem feriado', async () => {
      const cancelada = await aulaPassada(3);
      const feriado = await aulaPassada(4);
      await servico.atualizar(PROF, cancelada.id, { status: StatusOcorrencia.CANCELADA });
      await servico.atualizar(PROF, feriado.id, { status: StatusOcorrencia.FERIADO });

      const ids = await idsDe();
      expect(ids).not.toContain(cancelada.id);
      expect(ids).not.toContain(feriado.id);
    });

    /**
     * Turma arquivada parou de cobrar.
     *
     * Ela arquiva a turma para tirá-la do caminho; continuar listando "12 aulas
     * de Cálculo I sem registro" pelo resto do ano é a mesma promessa quebrada
     * do alarme que continuava tocando. O que já ESTÁ registrado não some — o
     * histórico e a exportação não filtram por `ativo`, e não podem: o
     * relatório do semestre passado é justamente o de turmas que acabaram.
     */
    it('não lista pendência de turma arquivada', async () => {
      const oc = await aulaPassada(3);
      expect(await idsDe()).toContain(oc.id);

      await prisma.cadeira.update({ where: { id: oc.cadeiraId }, data: { ativo: false } });

      expect(await idsDe()).not.toContain(oc.id);
    });

    /**
     * E o recorte que ela escolheu na tela sobrevive a isso.
     *
     * O `ativo` mora na MESMA chave `cadeira` do filtro de disciplina, ano e
     * semestre. Escrito por cima do espalhamento em vez de mesclado, ele
     * apagaria o recorte em silêncio — e a lista passaria a mostrar as onze
     * turmas quando ela pediu uma. É a única parte disto que não dá erro
     * nenhum quando quebra.
     */
    it('o recorte por disciplina sobrevive ao filtro de turma arquivada', async () => {
      const oc = await aulaPassada(3); // Geografia · 7º C

      expect(
        (await servico.pendencias(PROF, 45, { disciplina: 'Geografia' })).map((o) => o.id),
      ).toEqual([oc.id]);
      expect(await servico.pendencias(PROF, 45, { disciplina: 'Matemática' })).toEqual([]);
    });

    it('respeita a janela de dias pedida', async () => {
      const antiga = await aulaPassada(60);

      expect(await idsDe(45)).not.toContain(antiga.id);
      expect(await idsDe(90)).toContain(antiga.id);
    });

    it('não mostra pendência de outro professor', async () => {
      const alheia = await aulaPassada(3, OUTRO);

      expect(await idsDe()).not.toContain(alheia.id);
      expect((await servico.pendencias(OUTRO, 45)).map((o) => o.id)).toContain(alheia.id);
    });
  });

  it('listar devolve só a janela pedida, e só do professor certo', async () => {
    const naJanela = await servico.listar(PROF, '2026-09-01', '2026-09-30');
    expect(naJanela).toHaveLength(1);

    expect(await servico.listar(PROF, '2026-10-01', '2026-10-31')).toHaveLength(0);
    expect(await servico.listar(OUTRO, '2026-09-01', '2026-09-30')).toHaveLength(0);
  });
});
