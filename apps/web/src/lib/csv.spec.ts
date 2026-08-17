import { campoCsv, historicoParaCsv } from './csv';
import type { LinhaDoHistorico } from './types';

const linha = (extra: Partial<LinhaDoHistorico> = {}): LinhaDoHistorico => ({
  registroId: 'r1',
  ocorrenciaId: 'o1',
  data: '2026-08-14',
  horaInicio: '07:00',
  horaFim: '07:50',
  cadeira: { id: 'c1', disciplina: 'Matemática', turma: '8º A', corHex: '#000' },
  unidade: 'Números racionais',
  topicos: ['Frações equivalentes', 'Números decimais'],
  planoPrevisto: null,
  conteudoDado: 'Revisão de frações',
  atividadeCasa: null,
  dataEntrega: null,
  planoProximaAula: null,
  anexos: 0,
  ...extra,
});

describe('campoCsv', () => {
  it('deixa em paz o que não precisa de aspas', () => {
    expect(campoCsv('Matemática')).toBe('Matemática');
  });

  it('protege vírgula — senão a planilha inteira desalinha', () => {
    expect(campoCsv('frações, exercícios 1 a 8')).toBe('"frações, exercícios 1 a 8"');
  });

  it('dobra aspas dentro do texto', () => {
    expect(campoCsv('a lista de "fixação"')).toBe('"a lista de ""fixação"""');
  });

  it('protege quebra de linha', () => {
    expect(campoCsv('linha 1\nlinha 2')).toBe('"linha 1\nlinha 2"');
  });

  it('nulo vira vazio, não "null"', () => {
    expect(campoCsv(null)).toBe('');
    expect(campoCsv(undefined)).toBe('');
  });
});

describe('historicoParaCsv', () => {
  it('põe o cabeçalho e uma linha por registro', () => {
    const csv = historicoParaCsv([linha(), linha({ registroId: 'r2' })]);
    const linhas = csv.split('\r\n');

    expect(linhas[0]).toContain('Data,Início,Fim,Disciplina,Turma');
    expect(linhas).toHaveLength(3);
  });

  it('escreve data em DD/MM/YYYY, como o resto do app', () => {
    expect(historicoParaCsv([linha()]).split('\r\n')[1]).toMatch(/^14\/08\/2026,07:00,07:50,/);
  });

  it('junta tópicos com ponto e vírgula, para a vírgula não brigar com o CSV', () => {
    expect(historicoParaCsv([linha()])).toContain('Frações equivalentes; Números decimais');
  });

  it('não vaza a fala nem o rascunho da IA', () => {
    // O tipo já não tem esses campos — o endpoint não os busca. Este teste
    // trava a garantia contra alguém acrescentar a coluna "porque seria útil".
    const csv = historicoParaCsv([
      linha({ conteudoDado: 'Revisão de frações' }),
    ]);
    expect(csv).not.toMatch(/transcricao|resumoPadronizado/i);
    expect(csv.split('\r\n')[0]).not.toMatch(/fala|transcri/i);
  });

  it('sobrevive a lista vazia devolvendo só o cabeçalho', () => {
    expect(historicoParaCsv([]).split('\r\n')).toHaveLength(1);
  });
});
