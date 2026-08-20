import { readFileSync } from 'fs';
import { join } from 'path';
import { ehPlanoUnifor, lerPlanoUnifor } from './unifor';

/**
 * O texto de um `Plano de Ensino` real, extraído do PDF pelo mesmo caminho da
 * API (`extrairTextoDePdf`), com a síntese do Lattes, o nome da professora e a
 * bibliografia removidos — dado pessoal não entra em arquivo versionado, e
 * nenhum deles é lido pelo parser.
 */
const PLANO = readFileSync(join(__dirname, 'exemplos', 'plano-unifor.txt'), 'utf8');

describe('ehPlanoUnifor', () => {
  it('reconhece o plano de exemplo', () => {
    expect(ehPlanoUnifor(PLANO)).toBe(true);
  });

  it('recusa documento de outro formato', () => {
    // Recusar manda o documento para o caminho da Groq, que lê formato livre.
    // Aceitar o documento errado é pior: o parser devolveria unidades pela
    // metade e ela não teria como saber que faltou coisa.
    expect(ehPlanoUnifor('Plano de curso\n1º bimestre\nFrações\nDecimais')).toBe(false);
    expect(ehPlanoUnifor('PLANO DE ENSINO 2026.2\nCRONOGRAMA\n04/08')).toBe(false);
    expect(ehPlanoUnifor('')).toBe(false);
  });
});

describe('lerPlanoUnifor', () => {
  const plano = lerPlanoUnifor(PLANO)!;

  it('lê o período do cabeçalho', () => {
    expect(plano).toMatchObject({ ano: 2026, semestre: 2 });
  });

  it('lê a identificação pela forma, não pela posição', () => {
    // O bloco sai embaralhado do PDF: os rótulos vêm todos juntos e os valores
    // depois, em outra ordem. Casar por vizinhança poria a disciplina no campo
    // de horário.
    expect(plano.disciplina).toBe('Ambiente De Dados');
    expect(plano.codigoTurma).toBe('T203 - 30(31)');
  });

  it('decodifica os dois horários como UMA turma que encontra duas vezes', () => {
    // A regra que decide a forma no banco: uma `SerieAula` com dois
    // `SerieHorario`, nunca duas cadeiras. Duas cadeiras partiriam o progresso
    // ao meio e disparariam o alarme em duplicata, e a grade ficaria com a
    // mesma cara na tela.
    expect(plano.horarios).toHaveLength(2);
    expect(plano.horarios.map((h) => h.diaSemana)).toEqual([2, 4]); // terça e quinta
    expect(new Set(plano.horarios.map((h) => `${h.horaInicio}-${h.horaFim}`))).toEqual(
      new Set(['11:20-13:00']),
    );
  });

  it('lê as quatro unidades com a carga horária declarada', () => {
    expect(plano.unidades.map((u) => u.cargaHoraria)).toEqual([6, 12, 30, 24]);
    expect(plano.unidades.reduce((s, u) => s + (u.cargaHoraria ?? 0), 0)).toBe(72);
  });

  it('tira as horas-aula do título da unidade', () => {
    // O `(6 h/a)` é dado, não nome. Deixá-lo no título o levaria para o select
    // do fechamento e para o relatório que sai para a coordenação.
    expect(plano.unidades[0].titulo).toBe('Fundamentos de banco de dados relacional.');
    expect(plano.unidades.every((u) => !/h\/a/.test(u.titulo))).toBe(true);
  });

  it('o código do tópico é que diz a unidade', () => {
    // E não a posição no texto — é a âncora que faz o parser não depender da
    // ordem de leitura, que é o que se perde num PDF.
    expect(plano.unidades.map((u) => u.topicos.length)).toEqual([4, 4, 4, 4]);
    plano.unidades.forEach((u) => {
      u.topicos.forEach((t) => expect(t.startsWith(`0${u.ordem}.`)).toBe(true));
    });
  });

  it('copia o título do tópico com o código, como está escrito', () => {
    // Ela reconhece o próprio plano pelo `01.01`. Renumerar ou "melhorar" o
    // texto a faz desconfiar da importação inteira.
    expect(plano.unidades[0].topicos[0]).toBe('01.01 - Aplicação de banco de dados em empresas.');
  });

  it('lê as 37 datas do cronograma, sem repetir', () => {
    // O documento lista 04/08 em duas linhas da tabela.
    expect(plano.encontros).toHaveLength(37);
    expect(new Set(plano.encontros).size).toBe(37);
    expect(plano.encontros[0]).toBe('2026-08-04');
    expect(plano.encontros[36]).toBe('2026-12-10');
  });

  it('pega a data que vem colada no dia da semana', () => {
    // `01/12Ter` no texto extraído: entre `2` e `T` não há fronteira de
    // palavra, e um `\b` no lugar do `(?!\d)` perdia as duas datas sem
    // conteúdo do documento — em silêncio, que é como a grade nasce curta.
    expect(plano.encontros).toContain('2026-12-01');
    expect(plano.encontros).toContain('2026-12-08');
  });

  it('todas as datas caem em terça ou quinta, como os horários dizem', () => {
    // A checagem cruzada que prova a decodificação de `M3EF`/`M5EF`: se o
    // dígito fosse número do tempo em vez de dia da semana, isto não fecharia.
    const dias = new Set(plano.encontros.map((d) => new Date(`${d}T12:00:00Z`).getUTCDay()));

    expect(dias).toEqual(new Set(plano.horarios.map((h) => h.diaSemana)));
  });

  it('NÃO devolve pareamento data → tópico', () => {
    // A decisão mais cara deste arquivo, e a que alguém vai querer "melhorar".
    // A tabela do cronograma não tem régua entre as linhas: três métodos
    // independentes discordam sobre quais tópicos caem em 06/08. E mesmo lida
    // corretamente ela não serve — `03.01` aparece em 11 aulas seguidas
    // enquanto `03.02`, `03.03` e `03.04` aparecem uma vez cada.
    //
    // Quem decide o que cai em cada data é `planos/cronograma.ts`, estimando
    // pelas horas-aula. Ler aquela tabela poria conteúdo errado no alarme.
    expect(plano.encontros.every((e) => typeof e === 'string')).toBe(true);
    expect(JSON.stringify(plano.encontros)).not.toMatch(/\d{2}\.\d{2}/);
  });

  it('devolve null para documento de outro formato', () => {
    // Null e não objeto vazio: quem chama precisa distinguir "não é este
    // formato" (e tentar o modelo) de "é este formato e está vazio".
    expect(lerPlanoUnifor('Plano de curso\n1º bimestre\nFrações')).toBeNull();
  });

  it('não confunde local com horário', () => {
    // `J16 (30), J16 (31)` tem a mesma pontuação de `M3EF (30), M5EF (31)`.
    expect(plano.horarios.map((h) => h.codigo)).toEqual(['M3EF', 'M5EF']);
  });
});
