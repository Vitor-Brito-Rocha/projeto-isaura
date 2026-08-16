import { aplicarResumo, montarEsquema, montarPrompt, type ResumoBruto } from './resumo.prompt';

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
    unidade: '',
    topicos: [],
    atividadeCasa: '',
    dataEntrega: '',
    planoProximaAula: '',
    ...parcial,
  };
}

describe('montarPrompt', () => {
  it('lista unidades e tópicos por título, e não expõe nenhum id', () => {
    const prompt = montarPrompt(AULA, 'terminei frações');

    expect(prompt).toContain('Números racionais');
    expect(prompt).toContain('- Frações equivalentes');
    expect(prompt).toContain('- Ângulos');

    // O modelo copia títulos justamente para nunca ter um id à mão: número
    // fora da lista ou título inventado simplesmente não casam em
    // `aplicarResumo`, e não viram marcação no plano.
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

describe('montarEsquema', () => {
  const props = (us = UNIDADES) =>
    (montarEsquema(us).properties as Record<string, Record<string, unknown>>);

  it('não tem campo de pessoa', () => {
    // A regra de LGPD não pode depender só da instrução no prompt: sem campo,
    // não há onde um nome de aluno caber, mesmo se o modelo desobedecer.
    expect(Object.keys(props())).toEqual([
      'conteudoDado',
      'unidade',
      'topicos',
      'atividadeCasa',
      'dataEntrega',
      'planoProximaAula',
    ]);
    expect(montarEsquema(UNIDADES).additionalProperties).toBe(false);
  });

  it('lista os títulos válidos como enum', () => {
    // O motivo de o schema ser montado por aula. Com número, o modelo pedia
    // `[12]` querendo dizer "1 e 2" — emendava os dígitos, medido contra o
    // modelo de verdade. Título não tem como emendar.
    expect(props().unidade.enum).toEqual(['', 'Números racionais', 'Geometria plana']);
    expect((props().topicos.items as { enum: string[] }).enum).toEqual([
      'Frações equivalentes',
      'Soma de frações',
      'Ângulos',
    ]);
  });

  it('sem tópicos no plano, cai na string solta em vez de enum vazio', () => {
    // `enum: []` é schema inválido e o provedor recusaria a chamada inteira.
    const semTopicos = [{ id: 'u1', titulo: 'Sem tópicos', topicos: [] }];

    expect(props(semTopicos).topicos.items).toEqual({ type: 'string' });
    expect(props(semTopicos).unidade.enum).toEqual(['', 'Sem tópicos']);
  });

  it('sem plano nenhum, ainda deixa devolver vazio', () => {
    expect(props([]).unidade.enum).toEqual(['']);
  });
});

describe('aplicarResumo', () => {
  it('traduz títulos para os ids reais', () => {
    const r = aplicarResumo(resposta({ unidade: 'Números racionais', topicos: ['Frações equivalentes', 'Soma de frações'] }), UNIDADES);

    expect(r.unidadeId).toBe('u1');
    expect(r.topicosCobertos).toEqual(['t1', 't2']);
  });

  it('descarta título que não existe na lista', () => {
    // O enum reduz a chance, mas `strict` na Groq valida DEPOIS de gerar — e
    // sem ele a resposta passa crua. É aqui que a alucinação morre.
    const r = aplicarResumo(resposta({ unidade: 'Unidade que não existe', topicos: ['Frações equivalentes', 'Fotossíntese'] }), UNIDADES);

    expect(r.unidadeId).toBe('u1'); // caiu de volta na unidade dos tópicos válidos
    expect(r.topicosCobertos).toEqual(['t1']);
  });

  it('deduz a unidade a partir dos tópicos quando ela não veio', () => {
    const r = aplicarResumo(resposta({ topicos: ['Ângulos'] }), UNIDADES);

    expect(r.unidadeId).toBe('u2');
    expect(r.topicosCobertos).toEqual(['t3']);
  });

  it('não deixa tópico de outra unidade passar', () => {
    // O formulário só mostra os tópicos da unidade escolhida. Tópico de fora
    // viraria marcação invisível: gravada e impossível de desmarcar na tela.
    const r = aplicarResumo(resposta({ unidade: 'Geometria plana', topicos: ['Frações equivalentes', 'Ângulos'] }), UNIDADES);

    expect(r.unidadeId).toBe('u2');
    expect(r.topicosCobertos).toEqual(['t3']);
  });

  it('não repete tópico citado duas vezes', () => {
    const r = aplicarResumo(resposta({ unidade: 'Números racionais', topicos: ['Frações equivalentes', 'Frações equivalentes', 'Soma de frações'] }), UNIDADES);

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
