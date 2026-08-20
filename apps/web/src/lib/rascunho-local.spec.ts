import {
  guardar,
  mesmosValores,
  podar,
  recuperar,
  remover,
  VALIDADE_MS,
  type RascunhoLocal,
} from './rascunho-local';

const AGORA = new Date('2026-08-20T10:00:00Z').getTime();

interface Fechamento {
  conteudo: string;
  topicos: string[];
}

const VAZIO: Fechamento = { conteudo: '', topicos: [] };

function comRascunho(valores: object, chave = 'fechamento:oc1'): RascunhoLocal[] {
  return guardar([], chave, valores, AGORA);
}

describe('recuperar', () => {
  it('devolve o que ela digitou e não salvou', () => {
    const lista = comRascunho({ conteudo: 'Frações equivalentes', topicos: ['t1'] });

    expect(recuperar<Fechamento>(lista, 'fechamento:oc1', VAZIO)?.conteudo).toBe(
      'Frações equivalentes',
    );
  });

  it('some quando é igual ao que o servidor já tem', () => {
    // O caso real: a fila subiu enquanto ela estava noutra tela. Restaurar aqui
    // não recupera nada, e o aviso diria "isto não foi salvo" sobre exatamente
    // o que está salvo.
    const gravado: Fechamento = { conteudo: 'Frações', topicos: ['t1'] };
    const lista = comRascunho(gravado);

    expect(recuperar(lista, 'fechamento:oc1', gravado)).toBeNull();
  });

  it('ordem dos tópicos não é diferença', () => {
    // Marcar A e B é o mesmo estado que marcar B e A. Tratar como diferença
    // faria a tela anunciar um rascunho recuperado que não muda nada.
    const lista = comRascunho({ conteudo: 'Frações', topicos: ['t2', 't1'] });

    expect(recuperar(lista, 'fechamento:oc1', { conteudo: 'Frações', topicos: ['t1', 't2'] })).toBeNull();
  });

  it('não confunde a abertura com o fechamento da mesma aula', () => {
    // As duas metades do mesmo gesto. Trocá-las escreveria o plano da próxima
    // aula por cima do que ela deu.
    const lista = comRascunho({ plano: 'Soma de frações' }, 'abertura:oc1');

    expect(recuperar(lista, 'fechamento:oc1', VAZIO)).toBeNull();
  });

  it('sem rascunho guardado devolve null', () => {
    expect(recuperar([], 'fechamento:oc1', VAZIO)).toBeNull();
  });
});

describe('guardar', () => {
  it('substitui o rascunho anterior em vez de acumular', () => {
    // O que importa é o último estado da tela, não o histórico de teclas.
    const lista = guardar(comRascunho({ conteudo: 'Fra' }), 'fechamento:oc1', { conteudo: 'Frações' }, AGORA);

    expect(lista).toHaveLength(1);
    expect(recuperar<{ conteudo: string }>(lista, 'fechamento:oc1', { conteudo: '' })?.conteudo).toBe(
      'Frações',
    );
  });

  it('não mexe no rascunho de outra aula', () => {
    const lista = guardar(comRascunho({ conteudo: 'A' }, 'fechamento:oc1'), 'fechamento:oc2', { conteudo: 'B' }, AGORA);

    expect(lista).toHaveLength(2);
  });
});

describe('podar', () => {
  it('tira o que passou da validade e mantém o resto', () => {
    const lista: RascunhoLocal[] = [
      { chave: 'fechamento:velho', valores: { conteudo: 'A' }, salvoEm: AGORA - VALIDADE_MS - 1 },
      { chave: 'fechamento:novo', valores: { conteudo: 'B' }, salvoEm: AGORA - 1000 },
    ];

    expect(podar(lista, AGORA).map((r) => r.chave)).toEqual(['fechamento:novo']);
  });
});

describe('remover', () => {
  it('tira só a chave pedida', () => {
    const lista = guardar(comRascunho({ conteudo: 'A' }, 'fechamento:oc1'), 'abertura:oc1', { plano: 'B' }, AGORA);

    expect(remover(lista, 'fechamento:oc1').map((r) => r.chave)).toEqual(['abertura:oc1']);
  });
});

describe('mesmosValores', () => {
  it('a ordem em que os campos foram escritos não conta', () => {
    expect(mesmosValores({ a: '1', b: '2' }, { b: '2', a: '1' })).toBe(true);
  });

  it('campo vazio é diferente de campo preenchido', () => {
    expect(mesmosValores({ a: '' }, { a: '1' })).toBe(false);
  });
});
