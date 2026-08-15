/**
 * Popula uma conta com uma semana de aulas parecida com a real, para dar para
 * testar a tela sem esperar a professora cadastrar onze cadeiras na mão.
 *
 *   npm run --workspace apps/api dados:teste -- alguem@exemplo.com
 *
 * Regras que este script segue de propósito:
 *
 * - **Não cria conta.** Ele exige que o professor já exista (cadastro pelo app,
 *   com senha que ninguém além dele digita) e só pendura dado nele.
 * - **Idempotente e cirúrgico.** Tudo nasce com id prefixado pela marca abaixo,
 *   e rodar de novo apaga só o que tem esse prefixo. Nunca encosta em dado
 *   real, nem em outra conta — é o mesmo truque dos testes de integração.
 * - **O passado já foi notificado.** As ocorrências antigas nascem com as duas
 *   marcas de alarme preenchidas; senão, o cron de fechamento dispararia uma
 *   avalanche de notificação de aula de três semanas atrás no primeiro minuto.
 */
import { Frequencia, PrismaClient, StatusOcorrencia } from '@prisma/client';
import {
  dataIsoNaTz,
  dataUTC,
  hhmmNaTz,
  instanteDeParede,
  isoDeDataUTC,
  somarDias,
} from '../src/common/tz';

const prisma = new PrismaClient();

const MIN = 60_000;
const ANO = new Date().getUTCFullYear();

/**
 * Marca de origem: tudo que este script cria tem id começando com isto.
 *
 * É hexadecimal por obrigação, não por estilo. Os ids gerados precisam ser
 * **uuid v4 de verdade**, porque os DTOs recusam qualquer outro formato — dado
 * de teste que não passa pela mesma validação do dado real não testa nada, e a
 * primeira versão deste script (ids tipo `demo-u2`) fazia a tela devolver
 * "unidadeId must be a UUID" no primeiro salvamento.
 */
const MARCA = 'decafbad';
const P = `${MARCA}-`;

let sequencia = 0;
/** uuid v4 válido (nibble de versão 4, variante 8) e reconhecível na marca. */
function novoId(): string {
  sequencia += 1;
  return `${MARCA}-0000-4000-8000-${String(sequencia).padStart(12, '0')}`;
}

const PLANO = {
  nome: 'Matemática — 8º ano',
  disciplina: 'Matemática',
  unidades: [
    {
      titulo: 'Números racionais',
      topicos: [
        'Frações equivalentes',
        'Soma e subtração de frações',
        'Multiplicação e divisão de frações',
        'Números decimais',
        'Porcentagem',
      ],
    },
    {
      titulo: 'Álgebra',
      topicos: [
        'Expressões algébricas',
        'Equações do 1º grau',
        'Sistemas de equações',
        'Problemas com equações',
      ],
    },
    {
      titulo: 'Geometria plana',
      topicos: ['Ângulos', 'Triângulos', 'Quadriláteros', 'Área e perímetro'],
    },
  ],
};

/**
 * Duas turmas de 8º ano dividem o mesmo plano de propósito: é o que faz a
 * sugestão "no 8º A você deu X" aparecer na abertura do 8º B, que é a peça mais
 * difícil de testar sem dado plausível.
 */
const CADEIRAS = [
  { sufixo: 'mat8a', disciplina: 'Matemática', turma: '8º A', cor: '#2F4A9C', comPlano: true },
  { sufixo: 'mat8b', disciplina: 'Matemática', turma: '8º B', cor: '#1F6F5C', comPlano: true },
  { sufixo: 'mat9a', disciplina: 'Matemática', turma: '9º A', cor: '#8A3B7A', comPlano: false },
  { sufixo: 'cie7b', disciplina: 'Ciências', turma: '7º B', cor: '#B25A1F', comPlano: false },
  { sufixo: 'mat7a', disciplina: 'Matemática', turma: '7º A', cor: '#4A6B23', comPlano: false },
];

/** Grade semanal: [diaSemana (0=dom), horaInicio, horaFim] por cadeira. */
const GRADE: Record<string, [number, string, string][]> = {
  mat8a: [
    [1, '07:00', '07:50'],
    [3, '07:00', '07:50'],
    [5, '09:40', '10:30'],
  ],
  mat8b: [
    [2, '07:00', '07:50'],
    [4, '08:40', '09:30'],
  ],
  mat9a: [
    [1, '10:30', '11:20'],
    [4, '07:00', '07:50'],
  ],
  cie7b: [
    [2, '13:30', '14:20'],
    [5, '13:30', '14:20'],
  ],
  mat7a: [[3, '13:30', '14:20']],
};

/** Conteúdo plausível para o histórico, em ordem — vira o encadeamento. */
const HISTORICO = [
  {
    conteudo: 'Revisão de frações equivalentes com a reta numérica. Exercícios 1 a 6 da apostila.',
    topico: 'Frações equivalentes',
    proxima: 'Começar soma de frações com denominadores diferentes',
  },
  {
    conteudo: 'Soma de frações com denominadores diferentes. Boa parte da turma pegou o mmc.',
    topico: 'Soma e subtração de frações',
    proxima: 'Subtração de frações e uma lista de fixação',
  },
  {
    conteudo: 'Subtração de frações e correção da lista. Ainda tem dificuldade em simplificar.',
    topico: 'Soma e subtração de frações',
    proxima: 'Multiplicação de frações',
  },
  {
    conteudo: 'Multiplicação de frações e o porquê de multiplicar direto. Exercícios 12 a 18.',
    topico: 'Multiplicação e divisão de frações',
    proxima: 'Divisão de frações',
  },
  {
    conteudo: 'Divisão de frações pelo inverso. Passei lista para casa.',
    topico: 'Multiplicação e divisão de frações',
    proxima: 'Correção da lista e entrada em números decimais',
  },
  {
    conteudo: 'Correção da lista e introdução a números decimais.',
    topico: 'Números decimais',
    proxima: 'Operações com decimais',
  },
];

async function main() {
  const email = process.argv[2] ?? process.env.ADMIN_EMAIL;
  if (!email) {
    throw new Error('Informe o email: npm run --workspace apps/api dados:teste -- voce@exemplo.com');
  }

  const professor = await prisma.professor.findUnique({ where: { email } });
  if (!professor) {
    throw new Error(
      `Nenhum professor com o email ${email}. Crie a conta pelo app primeiro — ` +
        'este script não cria conta nem senha.',
    );
  }
  const professorId = professor.id;
  const tz = professor.timezone;

  // Limpeza cirúrgica: cascade leva séries, ocorrências e registros junto.
  const apagadas = await prisma.cadeira.deleteMany({
    where: { professorId, id: { startsWith: P } },
  });
  await prisma.planoCurricular.deleteMany({ where: { professorId, id: { startsWith: P } } });
  await prisma.escola.deleteMany({ where: { professorId, id: { startsWith: P } } });
  if (apagadas.count) console.log(`Limpou ${apagadas.count} cadeiras de teste anteriores.`);

  const escola = await prisma.escola.create({
    data: { id: novoId(), professorId, nome: 'EE Jardim das Acácias', turno: 'Manhã' },
  });

  const planoId = novoId();
  await prisma.planoCurricular.create({
    data: { id: planoId, professorId, nome: PLANO.nome, disciplina: PLANO.disciplina, anoLetivo: ANO },
  });

  const unidadeIds: string[] = [];
  const cadeiraPorSufixo = new Map<string, string>();
  const topicoPorTitulo = new Map<string, string>();
  for (const [iu, u] of PLANO.unidades.entries()) {
    const unidade = await prisma.unidade.create({
      data: {
        id: novoId(),
        professorId,
        planoCurricularId: planoId,
        ordem: iu + 1,
        titulo: u.titulo,
      },
    });
    unidadeIds.push(unidade.id);
    for (const [it, titulo] of u.topicos.entries()) {
      const t = await prisma.topico.create({
        data: { id: novoId(), unidadeId: unidade.id, ordem: it + 1, titulo },
      });
      topicoPorTitulo.set(titulo, t.id);
    }
  }

  // Âncora no dia de PAREDE dela, não em UTC: às 21h de Brasília o UTC já
  // virou, e a grade inteira nasceria um dia adiantada.
  const hojeIso = dataIsoNaTz(new Date(), tz);
  const hoje = dataUTC(hojeIso);

  for (const c of CADEIRAS) {
    const cadeiraId = novoId();
    cadeiraPorSufixo.set(c.sufixo, cadeiraId);
    await prisma.cadeira.create({
      data: {
        id: cadeiraId,
        professorId,
        escolaId: escola.id,
        disciplina: c.disciplina,
        turma: c.turma,
        anoLetivo: ANO,
        corHex: c.cor,
        planoCurricularId: c.comPlano ? planoId : null,
      },
    });

    const serie = await prisma.serieAula.create({
      data: {
        id: novoId(),
        professorId,
        cadeiraId,
        frequencia: Frequencia.SEMANAL,
        dataInicio: new Date(`${isoDeDataUTC(somarDias(hoje, -28))}T00:00:00.000Z`),
        horarios: {
          create: GRADE[c.sufixo].map(([diaSemana, horaInicio, horaFim]) => ({
            diaSemana,
            horaInicio,
            horaFim,
          })),
        },
      },
    });

    // Três semanas para trás (histórico) e duas para frente (grade a cumprir).
    let n = 0;
    for (let d = -21; d <= 14; d += 1) {
      const dia = somarDias(hoje, d);
      const horario = GRADE[c.sufixo].find(([ds]) => ds === dia.getUTCDay());
      if (!horario) continue;

      const [, horaInicio, horaFim] = horario;
      const dataIso = isoDeDataUTC(dia);
      const passada = dataIso < hojeIso;
      n += 1;

      const ocorrencia = await prisma.ocorrencia.create({
        data: {
          id: novoId(),
          professorId,
          cadeiraId,
          serieId: serie.id,
          data: new Date(`${dataIso}T00:00:00.000Z`),
          horaInicio,
          horaFim,
          inicioEm: instanteDeParede(dataIso, horaInicio, tz),
          fimEm: instanteDeParede(dataIso, horaFim, tz),
          status: passada ? StatusOcorrencia.DADA : StatusOcorrencia.AGENDADA,
          // Aula antiga com marca nula acordaria o cron de fechamento na hora.
          aberturaNotificadaEm: passada ? new Date() : null,
          fechamentoNotificadoEm: passada ? new Date() : null,
        },
      });

      // Só as turmas com plano ganham histórico rico: as outras existem
      // justamente para exercitar a tela sem plano curricular.
      if (!passada || !c.comPlano) continue;

      const h = HISTORICO[(n - 1) % HISTORICO.length];
      const topicoId = topicoPorTitulo.get(h.topico);
      await prisma.registroAula.create({
        data: {
          professorId,
          ocorrenciaId: ocorrencia.id,
          planoPrevisto: h.conteudo,
          conteudoDado: h.conteudo,
          unidadeId: unidadeIds[0],
          planoProximaAula: h.proxima,
          atividadeCasa: n % 2 === 0 ? 'Apostila, exercícios 12 a 18' : null,
          // Histórico é dela, escrito à mão: já nasce conferido.
          revisadoEm: new Date(),
          topicos: topicoId ? { create: [{ topicoId }] } : undefined,
        },
      });
    }
  }

  // Duas aulas fora da grade, para o teste de relógio não depender do dia da
  // semana em que o script rodou.
  const agora = new Date();
  const cadeiraTeste = cadeiraPorSufixo.get('mat8a')!;

  /** A hora de parede tem de continuar sendo "HH:mm" de verdade: é o que ela lê
   *  na grade, e o resto do código conta com esse formato. */
  async function aulaAvulsa(comecaEmMin: number, duracaoMin: number) {
    const inicioEm = new Date(agora.getTime() + comecaEmMin * MIN);
    const fimEm = new Date(inicioEm.getTime() + duracaoMin * MIN);
    await prisma.ocorrencia.create({
      data: {
        id: novoId(),
        professorId,
        cadeiraId: cadeiraTeste,
        data: dataUTC(dataIsoNaTz(inicioEm, tz)),
        horaInicio: hhmmNaTz(inicioEm, tz),
        horaFim: hhmmNaTz(fimEm, tz),
        inicioEm,
        fimEm,
      },
    });
  }

  await aulaAvulsa(7, 50);
  await aulaAvulsa(-54, 50);

  const total = await prisma.ocorrencia.count({ where: { professorId } });
  console.log(`
Pronto para ${email}.

  escola      1
  plano       1 (${PLANO.unidades.length} unidades, ${topicoPorTitulo.size} tópicos)
  cadeiras    ${CADEIRAS.length} — 8º A e 8º B dividem o mesmo plano (turmas irmãs)
  ocorrências ${total}

Alarmes plantados, se os crons estiverem rodando:
  abertura   dispara em ~2 min  (aula começa em 7, antecedência ${professor.antecedenciaPadraoMin})
  fechamento dispara em ~1 min  (aula terminou há 4, atraso ${professor.atrasoPadraoMin})

Rodar de novo apaga e recria só o que tem id "${P}".`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
