import type { PropostaDeImportacao } from '../ia/importacao.service';
import { cadeiraDoDocumento, identidadeDoPlano, turmaDoCodigo } from './identidade';

function proposta(
  identificacao: PropostaDeImportacao['identificacao'],
): PropostaDeImportacao {
  return { origem: 'unifor', paginas: 7, unidades: [], grade: null, encontros: [], identificacao };
}

const DA_UNIFOR = proposta({
  disciplina: 'Ambiente De Dados',
  codigoTurma: 'T203 - 30(31)',
  ano: 2026,
  semestre: 2,
});

describe('identidadeDoPlano', () => {
  it('monta o plano com o que o documento diz', () => {
    // Os quatro campos que ela digitava à mão antes de anexar o PDF que já os
    // trazia escritos.
    expect(identidadeDoPlano(DA_UNIFOR, 'Plano_de_Ensino_262T20331.pdf')).toEqual({
      nome: 'Ambiente De Dados — 2026.2',
      disciplina: 'Ambiente De Dados',
      anoLetivo: 2026,
      semestre: 2,
    });
  });

  it('sem semestre, o período é o ano inteiro', () => {
    // Escola básica não divide por semestre. `semestre` ausente e não zero —
    // `@Min(1)` recusaria o zero como erro de validação em vez de "não informado".
    const r = identidadeDoPlano(proposta({ ...DA_UNIFOR.identificacao!, semestre: null }), 'x.pdf');

    expect(r.nome).toBe('Ambiente De Dados — 2026');
    expect(r).not.toHaveProperty('semestre');
  });

  it('documento de outro formato nasce com o nome do arquivo', () => {
    // O parser não reconheceu, então não há identificação nenhuma. Pedir os
    // campos num formulário antes do upload traria de volta a digitação que
    // este caminho existe para acabar — ela renomeia no detalhe.
    const r = identidadeDoPlano(proposta(null), 'Plano de curso 8º ano.pdf');

    expect(r.nome).toBe('Plano de curso 8º ano');
    expect(r).not.toHaveProperty('disciplina');
    expect(r.anoLetivo).toBe(new Date().getUTCFullYear());
  });

  it('a extensão sai do nome, em qualquer caixa', () => {
    expect(identidadeDoPlano(proposta(null), 'PLANO.PDF').nome).toBe('PLANO');
  });

  it('nome de arquivo vazio ainda produz um nome', () => {
    // `@MinLength(1)` do `CreatePlanoDto` recusaria string vazia, e o plano
    // morreria na validação depois de o PDF já ter sido lido.
    const r = identidadeDoPlano(proposta(null), '.pdf');

    expect(r.nome.length).toBeGreaterThan(0);
  });

  it('corta nos tetos do DTO em vez de falhar na validação', () => {
    const longo = 'a'.repeat(500);
    const r = identidadeDoPlano(proposta({ disciplina: longo, codigoTurma: null, ano: 2026, semestre: 1 }), 'x.pdf');

    expect(r.nome.length).toBeLessThanOrEqual(160);
    expect(r.disciplina!.length).toBeLessThanOrEqual(120);
  });
});

describe('turmaDoCodigo', () => {
  it('tira a turma do código do documento', () => {
    expect(turmaDoCodigo('T203 - 30(31)')).toBe('30(31)');
  });

  it('guarda os DOIS números, não só o primeiro', () => {
    // `30` e `31` são a mesma turma encontrando duas vezes por semana. Guardar
    // metade jogaria fora o que impede alguém de cadastrar as duas separadas
    // depois — e duas cadeiras partem o progresso ao meio e duplicam o alarme.
    expect(turmaDoCodigo('T203 - 30(31)')).toContain('31');
  });

  it('sem traço, o código inteiro serve', () => {
    // Rótulo estranho que ela corrige na tela é melhor que campo vazio, que o
    // `@MinLength(1)` do DTO recusa depois de o PDF já ter sido lido.
    expect(turmaDoCodigo('T203')).toBe('T203');
  });

  it('não inventa turma a partir do nada', () => {
    // Traço sem nada depois não é turma: cair no código inteiro poria
    // "T203 -" como nome do grupo na grade e no alarme.
    expect(turmaDoCodigo(null)).toBeNull();
    expect(turmaDoCodigo('')).toBeNull();
    expect(turmaDoCodigo('T203 -   ')).toBeNull();
  });
});

describe('cadeiraDoDocumento', () => {
  it('monta a turma do plano de exemplo', () => {
    expect(cadeiraDoDocumento(DA_UNIFOR)).toEqual({
      disciplina: 'Ambiente De Dados',
      turma: '30(31)',
      anoLetivo: 2026,
      semestre: 2,
    });
  });

  it('sem disciplina não propõe nada', () => {
    // Documento de outro formato: não há o que propor, e inventar nome de turma
    // é pior que pedir. A tela cai no select das turmas que ela já tem.
    expect(cadeiraDoDocumento(proposta(null))).toBeNull();
  });

  it('sem código de turma não propõe nada', () => {
    expect(
      cadeiraDoDocumento(proposta({ disciplina: 'X', codigoTurma: null, ano: 2026, semestre: 1 })),
    ).toBeNull();
  });
});
