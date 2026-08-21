import { Prisma } from '@prisma/client';
import { FiltroExportacaoDto } from './filtro-exportacao.dto';

/**
 * O recorte da professora virando cláusula de `Ocorrencia`.
 *
 * Função pura e testada de propósito: é ela que decide o que sai num arquivo
 * que vai para a coordenação, e os dois jeitos de errar aqui são silenciosos —
 * mandar demais ou mandar nada, os dois sem erro na tela.
 */
/**
 * Tudo que descreve a CADEIRA, num objeto só.
 *
 * Em dois espalhamentos o segundo apaga o primeiro em silêncio — filtrar por
 * disciplina e por semestre juntos devolveria a disciplina inteira, de todos os
 * anos, sem nenhum sinal de que metade do filtro sumiu.
 *
 * Exportada com nome próprio porque quem precisa acrescentar UMA condição de
 * cadeira (as pendências, que ignoram turma arquivada) tem de mesclar com este
 * objeto em vez de escrever `cadeira:` de novo por cima. O tipo do Prisma não
 * defende: `OcorrenciaWhereInput['cadeira']` é um XOR, e desmontar o retorno
 * pronto para remontá-lo exigiria um cast — que é justamente onde o filtro dela
 * sumiria sem ninguém notar.
 */
export function cadeiraDoFiltro(f: FiltroExportacaoDto): Prisma.CadeiraWhereInput {
  return {
    ...(f.disciplina ? { disciplina: { equals: f.disciplina, mode: 'insensitive' as const } } : {}),
    ...(f.anoLetivo !== undefined ? { anoLetivo: f.anoLetivo } : {}),
    ...(f.semestre !== undefined ? { semestre: f.semestre } : {}),
  };
}

export function ondeDaOcorrencia(f: FiltroExportacaoDto): Prisma.OcorrenciaWhereInput {
  const daCadeira = cadeiraDoFiltro(f);

  const data = {
    ...(f.de ? { gte: new Date(`${f.de}T00:00:00.000Z`) } : {}),
    ...(f.ate ? { lte: new Date(`${f.ate}T00:00:00.000Z`) } : {}),
  };

  return {
    /**
     * `in: []` casa ZERO no Prisma, não "todas".
     *
     * Um array vazio chega aqui sempre que ela desmarca a última turma, e o
     * desfecho depende de qual erro se comete: aplicar o `in` devolve uma
     * exportação vazia (ruim, mas visível); trocar por "sem filtro" mandaria as
     * 11 turmas para a coordenação quando ela pediu uma (pior, e invisível).
     * Por isso o vazio simplesmente não aplica o filtro de cadeira — e a TELA é
     * quem impede o envio sem turma escolhida.
     */
    ...(f.cadeiraIds?.length ? { cadeiraId: { in: f.cadeiraIds } } : {}),
    ...(Object.keys(daCadeira).length ? { cadeira: daCadeira } : {}),
    ...(Object.keys(data).length ? { data } : {}),
  };
}

/** O mesmo recorte, já pendurado no `RegistroAula`. */
export function ondeDoRegistro(
  professorId: string,
  f: FiltroExportacaoDto,
): Prisma.RegistroAulaWhereInput {
  const daOcorrencia = ondeDaOcorrencia(f);

  return {
    professorId,
    // Só o que ela revisou e salvou. Rascunho de IA não é registro de aula —
    // mesma regra do progresso, e aqui pesa mais: isto vira documento.
    revisadoEm: { not: null },
    ...(Object.keys(daOcorrencia).length ? { ocorrencia: daOcorrencia } : {}),
  };
}
