import { ConflictException } from '@nestjs/common';
import { Frequencia, PrismaClient, StatusOcorrencia } from '@prisma/client';
import { RecorrenciaService } from '../agenda/recorrencia.service';
import { hhmmNaTz, instanteDeParede, isoDeDataUTC } from '../common/tz';
import { PrismaService } from '../prisma/prisma.service';
import { SeriesService } from './series.service';
import { urlDeTeste } from '../common/teste-db';

/**
 * Teste de integração contra um Postgres real.
 *
 * Pulado quando `TEST_DATABASE_URL` não está definido, para `npm test` continuar
 * rodando em qualquer máquina. Para rodar:
 *
 *   TEST_DATABASE_URL=postgresql://isaura:isaura@localhost:5432/isaura npm run test:api
 *
 * O que ele cobre e os testes unitários não conseguem: que a materialização
 * grava `inicioEm` como instante absoluto correto para a timezone de CADA
 * professor. Esse é o bug que o modelo antigo (comparar "HH:mm" como string)
 * teria, e ele só aparece com dois professores em fusos diferentes.
 */
const url = urlDeTeste();
const descreve = url ? describe : describe.skip;

descreve('SeriesService (integração)', () => {
  let prisma: PrismaService;
  let servico: SeriesService;

  const SP = 'prof-sp';
  const ACRE = 'prof-acre';

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url } } }) as unknown as PrismaService;
    servico = new SeriesService(prisma, new RecorrenciaService());
  });

  afterAll(async () => {
    await (prisma as unknown as PrismaClient).$disconnect();
  });

  beforeEach(async () => {
    // Cascade cuida do resto: apagar os professores leva escolas, cadeiras,
    // séries e ocorrências junto. Se isto deixar sobra, o cascade está errado.
    await prisma.professor.deleteMany({ where: { id: { in: [SP, ACRE] } } });

    await prisma.professor.createMany({
      data: [
        { id: SP, nome: 'Isaura', email: 'sp@teste.dev', timezone: 'America/Sao_Paulo' },
        { id: ACRE, nome: 'Rita', email: 'acre@teste.dev', timezone: 'America/Rio_Branco' },
      ],
    });
  });

  async function criarSerieDe(professorId: string) {
    const cadeira = await prisma.cadeira.create({
      data: { professorId, disciplina: 'Matemática', turma: '8º A', anoLetivo: 2026 },
    });
    // Uma quinta-feira, para a série semanal cair sempre no mesmo dia.
    return servico.criar(professorId, {
      cadeiraId: cadeira.id,
      frequencia: Frequencia.SEMANAL,
      dataInicio: '2026-08-06',
      horarios: [{ diaSemana: 4, horaInicio: '07:00', horaFim: '07:50' }],
    });
  }

  it('grava a MESMA hora de parede como instantes diferentes por fuso', async () => {
    const serieSp = await criarSerieDe(SP);
    const serieAcre = await criarSerieDe(ACRE);

    const [ocSp] = await prisma.ocorrencia.findMany({
      where: { serieId: serieSp.id },
      orderBy: { data: 'asc' },
      take: 1,
    });
    const [ocAcre] = await prisma.ocorrencia.findMany({
      where: { serieId: serieAcre.id },
      orderBy: { data: 'asc' },
      take: 1,
    });

    // Mesma leitura na grade das duas professoras...
    expect(ocSp.horaInicio).toBe('07:00');
    expect(ocAcre.horaInicio).toBe('07:00');
    // ...e a primeira aula cai no mesmo dia (mesma frequência, mesmo dia da
    // semana), então os instantes são comparáveis entre si.
    expect(isoDeDataUTC(ocSp.data)).toBe(isoDeDataUTC(ocAcre.data));

    // Mas são dois instantes distintos. Sem a coluna timestamptz, o cron
    // dispararia os dois alarmes no mesmo minuto, e a professora do Acre
    // receberia o dela duas horas adiantado.
    //
    // Derivado da data gerada, e não fixo: a janela de materialização começa
    // em hoje, então travar uma data no teste o quebraria a cada dia que passa.
    const dia = isoDeDataUTC(ocSp.data);
    expect(ocSp.inicioEm.toISOString()).toBe(
      instanteDeParede(dia, '07:00', 'America/Sao_Paulo').toISOString(),
    );
    expect(ocAcre.inicioEm.toISOString()).toBe(
      instanteDeParede(dia, '07:00', 'America/Rio_Branco').toISOString(),
    );
    expect(ocAcre.inicioEm.getTime() - ocSp.inicioEm.getTime()).toBe(2 * 3600 * 1000);

    // E a ida e volta fecha: o instante gravado relido no fuso de cada uma
    // devolve exatamente a hora que ela cadastrou.
    expect(hhmmNaTz(ocSp.inicioEm, 'America/Sao_Paulo')).toBe('07:00');
    expect(hhmmNaTz(ocAcre.inicioEm, 'America/Rio_Branco')).toBe('07:00');
  });

  it('grava fimEm coerente com a duração da aula', async () => {
    const serie = await criarSerieDe(SP);
    const [oc] = await prisma.ocorrencia.findMany({ where: { serieId: serie.id }, take: 1 });
    expect(oc.fimEm.getTime() - oc.inicioEm.getTime()).toBe(50 * 60 * 1000);
  });

  it('materializarFaltantes é idempotente', async () => {
    const serie = await criarSerieDe(SP);
    const depoisDoCriar = await prisma.ocorrencia.count({ where: { serieId: serie.id } });
    expect(depoisDoCriar).toBeGreaterThan(0);

    // O cron noturno roda isto todo dia em todas as séries. Se duplicasse, a
    // grade da professora encheria de aulas fantasma em uma semana.
    const geradas = await servico.materializarFaltantes(serie.id);
    expect(geradas).toBe(0);
    expect(await prisma.ocorrencia.count({ where: { serieId: serie.id } })).toBe(depoisDoCriar);
  });

  it('não materializa série inativa', async () => {
    const serie = await criarSerieDe(SP);
    await prisma.ocorrencia.deleteMany({ where: { serieId: serie.id } });
    await prisma.serieAula.update({ where: { id: serie.id }, data: { ativo: false } });

    expect(await servico.materializarFaltantes(serie.id)).toBe(0);
  });

  it('isola professores: a série de um não aparece para o outro', async () => {
    const serieSp = await criarSerieDe(SP);

    // Este é o teste do multitenant. `buscar` filtra por professorId no where —
    // sem isso, um uuid vazado daria acesso de leitura à grade de outra conta.
    await expect(servico.buscar(ACRE, serieSp.id)).rejects.toThrow('Série não encontrada.');
    await expect(servico.buscar(SP, serieSp.id)).resolves.toBeTruthy();

    expect(await servico.listar(ACRE)).toHaveLength(0);
    expect(await servico.listar(SP)).toHaveLength(1);
  });

  it('mudar a dataInicio regenera a grade futura', async () => {
    const serie = await criarSerieDe(SP);
    const antes = await prisma.ocorrencia.findMany({
      where: { serieId: serie.id },
      orderBy: { data: 'asc' },
    });
    expect(antes.length).toBeGreaterThan(0);

    // Adia o início em 4 semanas. As ocorrências das primeiras semanas têm de
    // sumir — antes desta correção, só trocar `horarios` disparava a
    // regeneração, e adiar o início deixava aulas fantasma na grade.
    const novoInicio = new Date(antes[0].data.getTime() + 28 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    await servico.atualizar(SP, serie.id, { dataInicio: novoInicio });

    const depois = await prisma.ocorrencia.findMany({
      where: { serieId: serie.id },
      orderBy: { data: 'asc' },
    });
    expect(depois.length).toBeLessThan(antes.length);
    expect(isoDeDataUTC(depois[0].data) >= novoInicio).toBe(true);
  });

  it('mudar a frequência regenera a grade futura', async () => {
    const serie = await criarSerieDe(SP);
    const semanal = await prisma.ocorrencia.count({ where: { serieId: serie.id } });

    await servico.atualizar(SP, serie.id, { frequencia: Frequencia.QUINZENAL });

    const quinzenal = await prisma.ocorrencia.count({ where: { serieId: serie.id } });
    expect(quinzenal).toBeLessThan(semanal);
    expect(quinzenal).toBeGreaterThan(0);
  });

  it('preserva o histórico ao regenerar: aula DADA não é apagada', async () => {
    const serie = await criarSerieDe(SP);
    const [primeira] = await prisma.ocorrencia.findMany({
      where: { serieId: serie.id },
      orderBy: { data: 'asc' },
      take: 1,
    });
    await prisma.ocorrencia.update({
      where: { id: primeira.id },
      data: { status: StatusOcorrencia.DADA },
    });

    await servico.atualizar(SP, serie.id, {
      horarios: [{ diaSemana: 4, horaInicio: '09:00', horaFim: '09:50' }],
    });

    // A aula já dada sobrevive com o horário original. Reescrevê-la apagaria o
    // registro do que de fato aconteceu — junto com o RegistroAula pendurado.
    const preservada = await prisma.ocorrencia.findUnique({ where: { id: primeira.id } });
    expect(preservada).not.toBeNull();
    expect(preservada!.horaInicio).toBe('07:00');
    expect(preservada!.status).toBe(StatusOcorrencia.DADA);
  });

  it('apagar o professor leva a grade junto (cascade)', async () => {
    const serie = await criarSerieDe(SP);
    expect(await prisma.ocorrencia.count({ where: { serieId: serie.id } })).toBeGreaterThan(0);

    await prisma.professor.delete({ where: { id: SP } });

    // "Excluir minha conta" precisa ser uma linha de código, não um roteiro de
    // limpeza que esquece uma tabela e deixa dado pessoal órfão no banco.
    expect(await prisma.ocorrencia.count({ where: { professorId: SP } })).toBe(0);
    expect(await prisma.serieAula.count({ where: { professorId: SP } })).toBe(0);
    expect(await prisma.cadeira.count({ where: { professorId: SP } })).toBe(0);
    expect(await prisma.serieHorario.count({ where: { serieId: serie.id } })).toBe(0);
  });

  /**
   * O sistema deixava três turmas na segunda às 07:00 e não reclamava.
   *
   * A regra pura já tem teste; o que só o banco prova é o recorte da consulta —
   * que ela olha as ocorrências certas, ignora as da própria série ao editar,
   * respeita o dono e não conta aula cancelada.
   */
  describe('choque de horário', () => {
    async function cadeiraDe(professorId: string, disciplina: string, turma: string) {
      return prisma.cadeira.create({
        data: { professorId, disciplina, turma, anoLetivo: 2026 },
      });
    }

    const naQuinta = (cadeiraId: string, horaInicio: string, horaFim: string) => ({
      cadeiraId,
      frequencia: Frequencia.SEMANAL,
      dataInicio: '2026-08-06',
      horarios: [{ diaSemana: 4, horaInicio, horaFim }],
    });

    it('recusa e diz com qual turma chocou', async () => {
      await criarSerieDe(SP); // Matemática · 8º A, quinta 07:00–07:50
      const outra = await cadeiraDe(SP, 'Ciências', '7º B');

      const tentativa = servico.criar(SP, naQuinta(outra.id, '07:20', '08:10'));

      await expect(tentativa).rejects.toBeInstanceOf(ConflictException);
      await expect(tentativa).rejects.toThrow(/Matemática · 8º A/);
    });

    it('deixa passar a aula seguinte, que só encosta', async () => {
      await criarSerieDe(SP);
      const outra = await cadeiraDe(SP, 'Ciências', '7º B');

      await expect(servico.criar(SP, naQuinta(outra.id, '07:50', '08:40'))).resolves.toBeDefined();
    });

    /**
     * A grade de uma professora não pode barrar a de outra. Se este quebrar, a
     * consulta perdeu o `professorId` — que é vazamento entre contas, não só um
     * falso positivo.
     */
    it('não olha a grade de outro professor', async () => {
      await criarSerieDe(SP);
      const doAcre = await cadeiraDe(ACRE, 'Matemática', '8º A');

      await expect(servico.criar(ACRE, naQuinta(doAcre.id, '07:00', '07:50'))).resolves.toBeDefined();
    });

    /**
     * Aula desmarcada não ocupa mais o horário. Bloquear por causa dela seria o
     * sistema defendendo um compromisso que a própria professora desfez.
     */
    it('aula cancelada não segura o horário', async () => {
      const serie = await criarSerieDe(SP);
      await prisma.ocorrencia.updateMany({
        where: { serieId: serie.id },
        data: { status: StatusOcorrencia.CANCELADA },
      });
      const outra = await cadeiraDe(SP, 'Ciências', '7º B');

      await expect(servico.criar(SP, naQuinta(outra.id, '07:00', '07:50'))).resolves.toBeDefined();
    });

    /**
     * Turma arquivada também não segura o horário — mesma leitura da cancelada,
     * um degrau acima.
     *
     * `desativar` cancela as aulas FUTURAS, mas as que já passaram continuam
     * AGENDADA de propósito: são histórico e podem ter registro. Sem o filtro
     * por `cadeira.ativo`, esse histórico bloqueava um plano novo no mesmo
     * horário, e a única saída era apagar a turma antiga — levando o histórico
     * junto, que é o que arquivar existe para evitar.
     */
    it('turma arquivada não segura o horário', async () => {
      const serie = await criarSerieDe(SP);
      // Só a cadeira fica inativa: as ocorrências continuam AGENDADA, que é o
      // caso que importa. Cancelá-las aqui repetiria o teste anterior.
      await prisma.cadeira.update({ where: { id: serie.cadeiraId }, data: { ativo: false } });
      const outra = await cadeiraDe(SP, 'Ciências', '7º B');

      await expect(servico.criar(SP, naQuinta(outra.id, '07:00', '07:50'))).resolves.toBeDefined();
    });

    /**
     * O caminho que ela de fato percorreu: importar o `Plano de Ensino` cria a
     * grade por DATAS, não por série, e é outra consulta — um filtro corrigido
     * só num dos dois deixaria a importação recusando o que a grade aceita.
     */
    it('a grade do calendário também ignora a turma arquivada', async () => {
      const serie = await criarSerieDe(SP); // quinta 07:00–07:50, a partir de 06/08
      const nova = await cadeiraDe(SP, 'Ambiente De Dados', '30(31)');

      const grade = {
        cadeiraId: nova.id,
        horarios: [{ diaSemana: 4, horaInicio: '07:00', horaFim: '07:50' }],
        datas: [isoDeDataUTC(new Date('2026-08-13T00:00:00.000Z'))],
      };

      await expect(servico.criarDoCalendario(SP, grade)).rejects.toBeInstanceOf(ConflictException);

      await prisma.cadeira.update({ where: { id: serie.cadeiraId }, data: { ativo: false } });

      await expect(servico.criarDoCalendario(SP, grade)).resolves.toEqual({
        criadas: 1,
        pedidas: 1,
      });
    });

    /**
     * Sem ignorar a própria série, toda edição chocaria consigo mesma: as
     * ocorrências antigas ainda estão no banco quando a checagem roda.
     */
    it('editar a própria série não choca com ela mesma', async () => {
      const serie = await criarSerieDe(SP);

      await expect(
        servico.atualizar(SP, serie.id, {
          horarios: [{ diaSemana: 4, horaInicio: '07:10', horaFim: '08:00' }],
        }),
      ).resolves.toBeDefined();
    });

    it('recusa dois horários sobrepostos no mesmo formulário', async () => {
      const cadeira = await cadeiraDe(SP, 'Matemática', '8º A');

      await expect(
        servico.criar(SP, {
          cadeiraId: cadeira.id,
          frequencia: Frequencia.SEMANAL,
          dataInicio: '2026-08-06',
          horarios: [
            { diaSemana: 4, horaInicio: '07:00', horaFim: '08:00' },
            { diaSemana: 4, horaInicio: '07:30', horaFim: '08:30' },
          ],
        }),
      ).rejects.toThrow(/sobrep/i);
    });
  });
});
