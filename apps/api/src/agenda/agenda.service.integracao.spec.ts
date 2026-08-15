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

  it('listar devolve só a janela pedida, e só do professor certo', async () => {
    const naJanela = await servico.listar(PROF, '2026-09-01', '2026-09-30');
    expect(naJanela).toHaveLength(1);

    expect(await servico.listar(PROF, '2026-10-01', '2026-10-31')).toHaveLength(0);
    expect(await servico.listar(OUTRO, '2026-09-01', '2026-09-30')).toHaveLength(0);
  });
});
