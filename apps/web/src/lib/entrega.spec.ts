import {
  ajudaDeEntrega,
  decidirEntrega,
  desfechoDoErro,
  nomeDoArquivo,
  rotuloDeEntrega,
  type Entrega,
} from './entrega';

describe('decidirEntrega', () => {
  it('celular com Web Share de arquivo compartilha', () => {
    expect(decidirEntrega({ temShare: true, aceitaArquivo: true })).toBe('COMPARTILHAR');
  });

  it('desktop sem share nenhum baixa', () => {
    expect(decidirEntrega({ temShare: false, aceitaArquivo: false })).toBe('BAIXAR');
  });

  /**
   * O caso que justifica as DUAS perguntas em vez de uma.
   *
   * Há navegador com `navigator.share` que só aceita texto e link. Se a decisão
   * olhasse apenas `temShare`, o botão diria "Compartilhar", a folha do sistema
   * abriria e a entrega falharia DEPOIS do clique — pior do que nunca ter
   * oferecido, porque ela já achou que tinha mandado.
   */
  it('share que não aceita arquivo cai para baixar', () => {
    expect(decidirEntrega({ temShare: true, aceitaArquivo: false })).toBe('BAIXAR');
  });

  it('aceitar arquivo sem ter share não inventa capacidade', () => {
    expect(decidirEntrega({ temShare: false, aceitaArquivo: true })).toBe('BAIXAR');
  });
});

describe('rotuloDeEntrega', () => {
  /**
   * A regra desta fase, e a mesma de `avisoDeDegradacao`: o rótulo promete o
   * que vai acontecer. Um botão "Compartilhar" que baixa em silêncio é o tipo
   * de mentira que o projeto trata como pior desfecho.
   */
  it('cada modo tem seu rótulo, e eles não se confundem', () => {
    expect(rotuloDeEntrega('COMPARTILHAR')).toBe('Compartilhar');
    expect(rotuloDeEntrega('BAIXAR')).toBe('Baixar');
  });

  it('todo modo tem rótulo e ajuda — nenhum cai em texto vazio', () => {
    const modos: Entrega[] = ['COMPARTILHAR', 'BAIXAR'];
    for (const m of modos) {
      expect(rotuloDeEntrega(m)).not.toHaveLength(0);
      expect(ajudaDeEntrega(m)).not.toHaveLength(0);
    }
  });
});

describe('nomeDoArquivo', () => {
  const EM = new Date(2026, 7, 17); // 17/08/2026, hora local

  it('uma disciplina e uma turma se explicam sozinhas', () => {
    expect(
      nomeDoArquivo({
        tipo: 'aulas',
        disciplinas: ['Matemática'],
        turmas: ['8º A'],
        periodo: '2026.1',
        em: EM,
      }),
    ).toBe('aulas-matematica-8-a-2026-1-17-08-2026.csv');
  });

  it('tira acento — nome de arquivo com "ç" viaja mal entre sistemas', () => {
    expect(nomeDoArquivo({ tipo: 'aulas', disciplinas: ['Educação Física'], em: EM })).toBe(
      'aulas-educacao-fisica-17-08-2026.csv',
    );
  });

  /** Onze turmas no nome ficariam maiores que a tela do celular ao anexar. */
  it('várias viram contagem, não lista', () => {
    expect(
      nomeDoArquivo({ tipo: 'aulas', disciplinas: ['Mat', 'Port'], turmas: ['8A', '8B', '9A'], em: EM }),
    ).toBe('aulas-2-disciplinas-3-turmas-17-08-2026.csv');
  });

  it('sem recorte nenhum ainda diz o que é e quando', () => {
    expect(nomeDoArquivo({ tipo: 'pendencias', em: EM })).toBe('pendencias-17-08-2026.csv');
  });

  /** O que ela exporta são coisas diferentes, e os arquivos não podem se confundir na pasta. */
  it('aulas e pendências nunca colidem', () => {
    const base = { disciplinas: ['Matemática'], em: EM };
    expect(nomeDoArquivo({ ...base, tipo: 'aulas' })).not.toBe(
      nomeDoArquivo({ ...base, tipo: 'pendencias' }),
    );
  });
});

describe('desfechoDoErro', () => {
  /**
   * Fechar a folha de compartilhamento sem escolher nada rejeita com
   * `AbortError`. Tratar como erro daria toast vermelho dizendo que não deu — e,
   * com fallback automático, um arquivo baixado depois de ela ter dito não.
   */
  it('desistir não é falhar', () => {
    const abortou = Object.assign(new Error('Share canceled'), { name: 'AbortError' });
    expect(desfechoDoErro(abortou)).toBe('CANCELADO');
  });

  it('erro de verdade continua sendo falha', () => {
    expect(desfechoDoErro(new Error('NotAllowedError'))).toBe('FALHOU');
  });

  it('não quebra com o que não é Error', () => {
    expect(desfechoDoErro(undefined)).toBe('FALHOU');
    expect(desfechoDoErro(null)).toBe('FALHOU');
    expect(desfechoDoErro('texto solto')).toBe('FALHOU');
  });
});
