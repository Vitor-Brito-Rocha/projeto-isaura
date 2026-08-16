import { chaveDisciplina, sugerirDisciplinas } from './disciplinas';

const TODAS = ['Biologia', 'Física', 'Gramática', 'História', 'Matemática', 'Química'];

describe('chaveDisciplina', () => {
  it('tira acento e caixa', () => {
    expect(chaveDisciplina('Matemática')).toBe('matematica');
    expect(chaveDisciplina('  FÍSICA ')).toBe('fisica');
  });

  it('faz as duas grafias baterem — é o ponto da função', () => {
    expect(chaveDisciplina('Matematica')).toBe(chaveDisciplina('Matemática'));
  });
});

describe('sugerirDisciplinas', () => {
  it('sugere pelo começo do nome', () => {
    expect(sugerirDisciplinas(TODAS, 'mat')[0]).toBe('Matemática');
  });

  it('acha mesmo sem o acento — o caso que o datalist nativo erra', () => {
    expect(sugerirDisciplinas(TODAS, 'fisi')).toEqual(['Física']);
  });

  it('põe quem começa com o texto na frente de quem só contém', () => {
    // "Gramática" contém "mat"; "Matemática" começa com ele.
    expect(sugerirDisciplinas(TODAS, 'mát')).toEqual(['Matemática', 'Gramática']);
  });

  it('oferece a grafia com acento para quem digitou sem', () => {
    // É a razão de a função existir: sem isto nasce "Quimica" ao lado de
    // "Química", e o histórico da disciplina fica partido em dois.
    expect(sugerirDisciplinas(TODAS, 'quimica')).toEqual(['Química']);
  });

  it('não repete de volta o que ela já digitou letra por letra', () => {
    expect(sugerirDisciplinas(TODAS, 'Matemática')).toEqual([]);
  });

  it('com o campo em branco, oferece as que ela já tem', () => {
    expect(sugerirDisciplinas(TODAS, '', 3)).toEqual(['Biologia', 'Física', 'Gramática']);
  });

  it('respeita o limite', () => {
    expect(sugerirDisciplinas(TODAS, 'a', 2)).toHaveLength(2);
  });

  it('devolve vazio quando nada casa', () => {
    expect(sugerirDisciplinas(TODAS, 'zzz')).toEqual([]);
  });
});
