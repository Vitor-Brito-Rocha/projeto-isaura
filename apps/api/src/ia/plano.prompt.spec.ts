import { aplicarPlano, ESQUEMA_PLANO, montarPromptPlano, type PlanoBruto } from './plano.prompt';
import { limparTexto, pareceEscaneado } from './pdf';

const bruto = (unidades: PlanoBruto['unidades']): PlanoBruto => ({ unidades });

describe('aplicarPlano', () => {
  it('passa unidades e tópicos como vieram', () => {
    expect(
      aplicarPlano(
        bruto([
          { titulo: 'Unidade 1 — Números racionais', topicos: ['Frações', 'Decimais'] },
          { titulo: 'Unidade 2 — Álgebra', topicos: [] },
        ]),
      ),
    ).toEqual([
      { titulo: 'Unidade 1 — Números racionais', topicos: ['Frações', 'Decimais'] },
      { titulo: 'Unidade 2 — Álgebra', topicos: [] },
    ]);
  });

  it('unidade sem tópicos é resposta válida, não erro', () => {
    // Plano que só lista os bimestres existe, e é melhor importar a estrutura
    // grossa do que recusar o documento inteiro.
    expect(aplicarPlano(bruto([{ titulo: '1º bimestre', topicos: [] }]))).toEqual([
      { titulo: '1º bimestre', topicos: [] },
    ]);
  });

  it('descarta título vazio, que o DTO recusaria', () => {
    expect(
      aplicarPlano(bruto([{ titulo: '   ', topicos: ['x'] }, { titulo: 'Álgebra', topicos: [] }])),
    ).toEqual([{ titulo: 'Álgebra', topicos: [] }]);
  });

  it('junta a unidade que aparece no sumário e no corpo', () => {
    // Sem isto, o select do fechamento mostra duas "Álgebra" e ela não tem como
    // saber qual escolher.
    expect(
      aplicarPlano(
        bruto([
          { titulo: 'Álgebra', topicos: ['Equações'] },
          { titulo: 'ALGEBRA', topicos: ['Sistemas'] },
        ]),
      ),
    ).toEqual([{ titulo: 'Álgebra', topicos: ['Equações'] }]);
  });

  it('não repete tópico dentro da unidade', () => {
    expect(
      aplicarPlano(bruto([{ titulo: 'U1', topicos: ['Frações', 'fracoes', 'Decimais'] }])),
    ).toEqual([{ titulo: 'U1', topicos: ['Frações', 'Decimais'] }]);
  });

  it('corta título em 200, que é o teto do DTO', () => {
    const longo = 'a'.repeat(500);
    const [u] = aplicarPlano(bruto([{ titulo: longo, topicos: [longo] }]));
    expect(u.titulo).toHaveLength(200);
    expect(u.topicos[0]).toHaveLength(200);
  });

  it('normaliza espaço, que o PDF traz de sobra', () => {
    expect(aplicarPlano(bruto([{ titulo: 'Unidade   1  —\n Álgebra', topicos: [] }]))[0].titulo).toBe(
      'Unidade 1 — Álgebra',
    );
  });

  it('lista vazia quando o documento não é plano de curso', () => {
    expect(aplicarPlano(bruto([]))).toEqual([]);
  });

  it('aguenta lixo no lugar da lista sem estourar', () => {
    // O schema garante forma quando o provedor aceita o modo estrito; a chamada
    // repete SEM ele quando não aceita, então esta função recebe o que vier.
    expect(aplicarPlano({ unidades: null } as unknown as PlanoBruto)).toEqual([]);
    expect(aplicarPlano({} as PlanoBruto)).toEqual([]);
    expect(aplicarPlano(bruto([{ titulo: 'U1', topicos: null as unknown as string[] }]))).toEqual([
      { titulo: 'U1', topicos: [] },
    ]);
  });

  it('põe teto no número de unidades', () => {
    const muitas = Array.from({ length: 100 }, (_, i) => ({ titulo: `U${i}`, topicos: [] }));
    expect(aplicarPlano(bruto(muitas))).toHaveLength(40);
  });
});

describe('ESQUEMA_PLANO', () => {
  it('é compatível com o modo estrito da Groq', () => {
    // As duas exigências: todo campo obrigatório e nada além do declarado.
    const item = (ESQUEMA_PLANO.properties as any).unidades.items;
    expect(ESQUEMA_PLANO.additionalProperties).toBe(false);
    expect(item.additionalProperties).toBe(false);
    expect(item.required).toEqual(['titulo', 'topicos']);
  });
});

describe('montarPromptPlano', () => {
  it('delimita o documento', () => {
    expect(montarPromptPlano('  Plano de curso  ')).toBe(
      '<documento>\nPlano de curso\n</documento>',
    );
  });
});

describe('limparTexto', () => {
  it('colapsa o espaço que o layout do PDF deixa', () => {
    expect(limparTexto('Unidade   1\r\n   Frações  \n\n\n\nDecimais')).toBe(
      'Unidade 1\nFrações\n\nDecimais',
    );
  });
});

describe('pareceEscaneado', () => {
  it('reconhece PDF digital', () => {
    expect(pareceEscaneado('x'.repeat(2000), 2)).toBe(false);
  });

  it('reconhece foto de papel', () => {
    // Escaneado traz camada de texto vazia ou quase. Mandar isso ao modelo
    // produziria unidades inventadas a partir do nada.
    expect(pareceEscaneado('', 3)).toBe(true);
    expect(pareceEscaneado('12', 3)).toBe(true);
  });

  it('PDF sem página é escaneado por definição — nada a extrair', () => {
    expect(pareceEscaneado('', 0)).toBe(true);
  });
});
