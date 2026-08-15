import { aplicarResumo, ESQUEMA, montarPrompt, type ResumoBruto } from './resumo.prompt';

/**
 * Só a parte pura do pipeline de voz: montar o contexto e traduzir a resposta.
 *
 * É onde estão as duas regras que não podem depender de o modelo obedecer —
 * id que ele não pode forjar, e coerência entre unidade e tópicos. O que
 * depende da rede (a chamada em si) não é testável aqui e não é o risco.
 */
const UNIDADES = [
  {
    id: 'u1',
    titulo: 'Números racionais',
    topicos: [
      { id: 't1', titulo: 'Frações equivalentes' },
      { id: 't2', titulo: 'Soma de frações' },
    ],
  },
  {
    id: 'u2',
    titulo: 'Geometria plana',
    topicos: [{ id: 't3', titulo: 'Ângulos' }],
  },
];

const AULA = {
  disciplina: 'Matemática',
  turma: '8º A',
  anoLetivo: 2026,
  data: new Date('2026-04-10T00:00:00.000Z'), // sexta-feira
  horaInicio: '07:00',
  horaFim: '07:50',
  planoPrevisto: null,
  unidades: UNIDADES,
};

function resposta(parcial: Partial<ResumoBruto> = {}): ResumoBruto {
  return {
    conteudoDado: '',
    unidade: 0,
    topicos: [],
    atividadeCasa: '',
    dataEntrega: '',
    planoProximaAula: '',
    ...parcial,
  };
}

describe('montarPrompt', () => {
  it('numera unidades e tópicos, e não expõe nenhum id', () => {
    const prompt = montarPrompt(AULA, 'terminei frações');

    expect(prompt).toContain('1. Números racionais');
    expect(prompt).toContain('2. Geometria plana');
    expect(prompt).toContain('1. [unidade 1] Frações equivalentes');
    expect(prompt).toContain('3. [unidade 2] Ângulos');

    // O modelo trabalha com números justamente para não ter um id à mão.
    for (const id of ['u1', 'u2', 't1', 't2', 't3']) {
      expect(prompt).not.toContain(id);
    }
  });

  it('leva o plano previsto, que é o que resolve referência vaga', () => {
    const prompt = montarPrompt(
      { ...AULA, planoPrevisto: 'Terminar frações equivalentes' },
      'continuei o que eu tinha planejado',
    );

    expect(prompt).toContain('Terminar frações equivalentes');
  });

  it('diz quando não há plano previsto, em vez de omitir a linha', () => {
    // Silêncio aqui faria o modelo tratar a ausência como esquecimento do
    // contexto e tentar adivinhar o conteúdo.
    expect(montarPrompt(AULA, 'dei a aula')).toContain('não registrou plano previsto');
  });

  it('ancora data relativa no dia da aula, com o dia da semana', () => {
    const prompt = montarPrompt(AULA, 'passei tarefa para segunda');

    expect(prompt).toContain('2026-04-10');
    expect(prompt).toContain('sexta-feira');
  });

  it('avisa quando a cadeira não tem plano curricular', () => {
    const prompt = montarPrompt({ ...AULA, unidades: [] }, 'dei a aula');

    expect(prompt).toContain('não segue plano curricular');
    expect(prompt).not.toContain('Unidades do plano');
  });
});

describe('ESQUEMA', () => {
  it('não tem campo de pessoa', () => {
    // A regra de LGPD não pode depender só da instrução no prompt: sem campo,
    // não há onde um nome de aluno caber, mesmo se o modelo desobedecer.
    const campos = Object.keys(ESQUEMA.properties as object);

    expect(campos).toEqual([
      'conteudoDado',
      'unidade',
      'topicos',
      'atividadeCasa',
      'dataEntrega',
      'planoProximaAula',
    ]);
    expect(ESQUEMA.additionalProperties).toBe(false);
  });
});

describe('aplicarResumo', () => {
  it('traduz números para os ids reais', () => {
    const r = aplicarResumo(resposta({ unidade: 1, topicos: [1, 2] }), UNIDADES);

    expect(r.unidadeId).toBe('u1');
    expect(r.topicosCobertos).toEqual(['t1', 't2']);
  });

  it('descarta número fora da lista', () => {
    // O schema garante inteiro, não que o inteiro exista. Este é o caso em que
    // uma alucinação de índice viraria marcação no plano.
    const r = aplicarResumo(resposta({ unidade: 99, topicos: [1, 42, -3] }), UNIDADES);

    expect(r.unidadeId).toBe('u1'); // caiu de volta na unidade dos tópicos válidos
    expect(r.topicosCobertos).toEqual(['t1']);
  });

  it('deduz a unidade a partir dos tópicos quando ela não veio', () => {
    const r = aplicarResumo(resposta({ unidade: 0, topicos: [3] }), UNIDADES);

    expect(r.unidadeId).toBe('u2');
    expect(r.topicosCobertos).toEqual(['t3']);
  });

  it('não deixa tópico de outra unidade passar', () => {
    // O formulário só mostra os tópicos da unidade escolhida. Tópico de fora
    // viraria marcação invisível: gravada e impossível de desmarcar na tela.
    const r = aplicarResumo(resposta({ unidade: 2, topicos: [1, 3] }), UNIDADES);

    expect(r.unidadeId).toBe('u2');
    expect(r.topicosCobertos).toEqual(['t3']);
  });

  it('não repete tópico citado duas vezes', () => {
    const r = aplicarResumo(resposta({ unidade: 1, topicos: [1, 1, 2] }), UNIDADES);

    expect(r.topicosCobertos).toEqual(['t1', 't2']);
  });

  it('sem unidade nem tópico, devolve nulo e lista vazia', () => {
    const r = aplicarResumo(resposta({ conteudoDado: 'revisão geral' }), UNIDADES);

    expect(r.unidadeId).toBeNull();
    expect(r.topicosCobertos).toEqual([]);
    expect(r.conteudoDado).toBe('revisão geral');
  });

  it('recusa data que o campo do formulário não exibiria', () => {
    expect(aplicarResumo(resposta({ dataEntrega: 'sexta-feira' }), UNIDADES).dataEntrega).toBe('');
    expect(aplicarResumo(resposta({ dataEntrega: '2026-13-45' }), UNIDADES).dataEntrega).toBe('');
    expect(aplicarResumo(resposta({ dataEntrega: '2026-04-17' }), UNIDADES).dataEntrega).toBe(
      '2026-04-17',
    );
  });

  it('corta texto no limite que o DTO de fechamento aceita', () => {
    // Sem isto, um resumo longo demais passaria daqui e só quebraria depois,
    // no salvamento — com a fala já descartada da tela.
    const r = aplicarResumo(resposta({ conteudoDado: 'a'.repeat(5000) }), UNIDADES);

    expect(r.conteudoDado).toHaveLength(4000);
  });
});
