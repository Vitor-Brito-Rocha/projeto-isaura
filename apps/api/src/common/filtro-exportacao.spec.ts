import { ondeDaOcorrencia, ondeDoRegistro } from './filtro-exportacao';

const UMA = '11111111-1111-4111-8111-111111111111';
const OUTRA = '22222222-2222-4222-8222-222222222222';

describe('ondeDaOcorrencia', () => {
  it('sem filtro nenhum não inventa cláusula', () => {
    expect(ondeDaOcorrencia({})).toEqual({});
  });

  it('recorta pelas turmas escolhidas', () => {
    expect(ondeDaOcorrencia({ cadeiraIds: [UMA, OUTRA] })).toEqual({
      cadeiraId: { in: [UMA, OUTRA] },
    });
  });

  /**
   * O caso que decide a fase.
   *
   * Array vazio chega toda vez que ela desmarca a última turma. `in: []` casa
   * zero no Prisma; trocar isso por "sem filtro" mandaria as 11 turmas para a
   * coordenação quando ela pediu uma — errado e invisível. Aqui o vazio não
   * aplica o filtro, e quem barra o envio é a tela.
   */
  it('turma nenhuma escolhida não vira "todas as turmas"', () => {
    expect(ondeDaOcorrencia({ cadeiraIds: [] })).toEqual({});
  });

  /**
   * A regressão que o comentário do `montarFiltro` original já previa: em dois
   * espalhamentos o segundo apaga o primeiro, e o filtro pela metade é mudo.
   */
  it('disciplina, ano e semestre convivem num objeto só', () => {
    const onde = ondeDaOcorrencia({ disciplina: 'Matemática', anoLetivo: 2026, semestre: 1 });

    expect(onde.cadeira).toEqual({
      disciplina: { equals: 'Matemática', mode: 'insensitive' },
      anoLetivo: 2026,
      semestre: 1,
    });
  });

  it('disciplina ignora caixa — ela digita com pressa', () => {
    expect(ondeDaOcorrencia({ disciplina: 'matemática' }).cadeira).toEqual({
      disciplina: { equals: 'matemática', mode: 'insensitive' },
    });
  });

  it('intervalo aberto de um lado só continua valendo', () => {
    expect(ondeDaOcorrencia({ de: '2026-02-01' })).toEqual({
      data: { gte: new Date('2026-02-01T00:00:00.000Z') },
    });
    expect(ondeDaOcorrencia({ ate: '2026-06-30' })).toEqual({
      data: { lte: new Date('2026-06-30T00:00:00.000Z') },
    });
  });

  it('turma e período são filtros irmãos, não excludentes', () => {
    const onde = ondeDaOcorrencia({ cadeiraIds: [UMA], de: '2026-02-01', ate: '2026-06-30' });

    expect(onde.cadeiraId).toEqual({ in: [UMA] });
    expect(onde.data).toEqual({
      gte: new Date('2026-02-01T00:00:00.000Z'),
      lte: new Date('2026-06-30T00:00:00.000Z'),
    });
  });

  it('semestre 0 não existe, mas ano sozinho vale', () => {
    // `semestre: undefined` é "não informado", e escola básica nunca informa.
    expect(ondeDaOcorrencia({ anoLetivo: 2026 }).cadeira).toEqual({ anoLetivo: 2026 });
  });
});

describe('ondeDoRegistro', () => {
  it('rascunho da IA nunca entra, com filtro ou sem', () => {
    expect(ondeDoRegistro('prof', {}).revisadoEm).toEqual({ not: null });
    expect(ondeDoRegistro('prof', { cadeiraIds: [UMA] }).revisadoEm).toEqual({ not: null });
  });

  it('sempre carrega o professor — multitenant não é opcional', () => {
    expect(ondeDoRegistro('prof', {}).professorId).toBe('prof');
  });

  it('não pendura ocorrência vazia quando não há recorte', () => {
    expect(ondeDoRegistro('prof', {}).ocorrencia).toBeUndefined();
  });

  it('pendura o recorte quando ele existe', () => {
    expect(ondeDoRegistro('prof', { cadeiraIds: [UMA] }).ocorrencia).toEqual({
      cadeiraId: { in: [UMA] },
    });
  });
});
