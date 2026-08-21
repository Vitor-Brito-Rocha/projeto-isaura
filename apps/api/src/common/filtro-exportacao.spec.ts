import { cadeiraDoFiltro, ondeDaOcorrencia, ondeDoRegistro } from './filtro-exportacao';

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

/**
 * O recorte de cadeira tem nome próprio porque as PENDÊNCIAS precisam
 * acrescentar uma condição a ele (`ativo: true`, para turma arquivada parar de
 * cobrar). Escrever `cadeira:` de novo por cima do espalhamento apagaria o
 * recorte que ela escolheu na tela — em silêncio, e o sintoma seria uma lista
 * de pendências das onze turmas quando ela pediu uma.
 */
describe('cadeiraDoFiltro', () => {
  it('junta disciplina, ano e semestre num objeto só', () => {
    expect(cadeiraDoFiltro({ disciplina: 'Matemática', anoLetivo: 2026, semestre: 1 })).toEqual({
      disciplina: { equals: 'Matemática', mode: 'insensitive' },
      anoLetivo: 2026,
      semestre: 1,
    });
  });

  it('é exatamente o que `ondeDaOcorrencia` põe na chave `cadeira`', () => {
    // Se os dois divergirem, "o que eu dei" e "o que falta" passam a responder
    // sobre conjuntos diferentes — que é o que a exportação existe para evitar.
    const filtro = { disciplina: 'Física', anoLetivo: 2025 };

    expect(ondeDaOcorrencia(filtro).cadeira).toEqual(cadeiraDoFiltro(filtro));
  });

  it('vazio quando o recorte não fala de cadeira, para a mescla não inventar filtro', () => {
    // `{ ...{}, ativo: true }` tem de sobrar só o `ativo`. Devolver `undefined`
    // aqui também funcionaria por acaso, e é justamente o tipo de acaso que
    // quebra no dia em que alguém troca o espalhamento de lugar.
    expect(cadeiraDoFiltro({ cadeiraIds: ['a1'], de: '2026-02-01' })).toEqual({});
  });
});
