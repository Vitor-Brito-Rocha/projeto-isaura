import { rascunhoPendente, valoresIniciais } from './rascunho';
import type { RegistroAula } from './types';

function registro(parcial: Partial<RegistroAula> = {}): RegistroAula {
  return {
    id: 'r1',
    planoPrevisto: null,
    conteudoDado: null,
    unidadeId: null,
    atividadeCasa: null,
    dataEntrega: null,
    planoProximaAula: null,
    transcricaoBruta: null,
    resumoPadronizado: null,
    revisadoEm: null,
    topicos: [],
    ...parcial,
  };
}

const RASCUNHO = JSON.stringify({
  conteudoDado: 'Frações equivalentes, exercícios 1 a 8',
  unidadeId: 'u1',
  topicosCobertos: ['t1'],
  atividadeCasa: 'página 42',
  dataEntrega: '2026-04-17',
  planoProximaAula: 'Soma de frações',
});

describe('rascunhoPendente', () => {
  it('devolve o rascunho enquanto ela não revisou', () => {
    expect(rascunhoPendente(registro({ resumoPadronizado: RASCUNHO }))?.conteudoDado).toContain(
      'Frações equivalentes',
    );
  });

  it('some depois de revisado', () => {
    // O que vale depois da revisão são os campos do registro. Devolver o
    // rascunho aqui reescreveria por cima da correção que ela fez.
    const r = registro({ resumoPadronizado: RASCUNHO, revisadoEm: '2026-04-10T12:00:00Z' });

    expect(rascunhoPendente(r)).toBeNull();
  });

  it('JSON quebrado não derruba a tela', () => {
    expect(rascunhoPendente(registro({ resumoPadronizado: '{isso não é json' }))).toBeNull();
  });

  it('campo faltando vira vazio, não undefined', () => {
    // O formulário é controlado: undefined num value transformaria o campo em
    // não-controlado e o React reclamaria no meio do registro.
    const r = rascunhoPendente(registro({ resumoPadronizado: '{"conteudoDado":"só isso"}' }));

    expect(r).toEqual({
      conteudoDado: 'só isso',
      unidadeId: null,
      topicosCobertos: [],
      atividadeCasa: '',
      dataEntrega: '',
      planoProximaAula: '',
    });
  });
});

describe('valoresIniciais', () => {
  it('sem registro, abre em branco', () => {
    expect(valoresIniciais(null, undefined)).toEqual({
      conteudo: '',
      unidadeId: '',
      topicos: [],
      atividade: '',
      entrega: '',
      proxima: '',
    });
  });

  it('herda a unidade da turma irmã quando não há registro', () => {
    expect(valoresIniciais(null, 'u9').unidadeId).toBe('u9');
  });

  it('abre com o que está gravado quando já foi revisado', () => {
    const r = registro({
      conteudoDado: 'o que ela escreveu',
      dataEntrega: '2026-04-17T00:00:00.000Z',
      revisadoEm: '2026-04-10T12:00:00Z',
      topicos: [{ registroId: 'r1', topicoId: 't5' }],
    });

    const v = valoresIniciais(r, 'u9');
    expect(v.conteudo).toBe('o que ela escreveu');
    expect(v.topicos).toEqual(['t5']);
    // O `<input type="date">` só aceita a parte da data.
    expect(v.entrega).toBe('2026-04-17');
  });

  it('rascunho pendente ganha do texto antigo, por inteiro', () => {
    // Ela salvou à mão, depois ditou de novo. Misturar campo a campo deixaria o
    // texto velho sobreviver ao lado do resumo novo, e ela salvaria uma colcha
    // que nunca conferiu.
    const r = registro({
      conteudoDado: 'texto antigo',
      atividadeCasa: 'tarefa antiga',
      resumoPadronizado: RASCUNHO,
    });

    const v = valoresIniciais(r, 'u9');
    expect(v.conteudo).toBe('Frações equivalentes, exercícios 1 a 8');
    expect(v.atividade).toBe('página 42');
    expect(v.unidadeId).toBe('u1');
    expect(v.topicos).toEqual(['t1']);
  });
});
