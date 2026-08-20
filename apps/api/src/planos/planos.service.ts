import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { AnexosService, type ArquivoRecebido } from '../anexos/anexos.service';
import { StorageService } from '../anexos/storage.service';
import { ImportacaoService } from '../ia/importacao.service';
import { PrismaService } from '../prisma/prisma.service';
import { identidadeDoPlano } from './identidade';
import {
  CreatePlanoDto,
  CreateTopicoDto,
  CreateUnidadeDto,
  ImportarUnidadesDto,
  UpdatePlanoDto,
  UpdateTopicoDto,
  UpdateUnidadeDto,
} from './dto/plano.dto';

/** "2026-03-15" → Date. Campo @db.Date, então só a data importa. */
function data(valor?: string): Date | undefined {
  if (!valor) return undefined;
  const d = new Date(`${valor}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

@Injectable()
export class PlanosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly importacao: ImportacaoService,
    private readonly anexos: AnexosService,
    private readonly storage: StorageService,
  ) {}

  /**
   * O documento entra, o plano nasce.
   *
   * Antes, criar um plano pedia nome, disciplina, ano e semestre — **os quatro
   * escritos no PDF** que ela anexaria no passo seguinte. Pedir a fonte antes
   * de ela entregar a fonte é pedir duas vezes, e eram três passos até o
   * primeiro clique.
   *
   * **A ordem aqui é a regra**: ler e recusar o que não dá para ler ANTES de
   * criar qualquer coisa. Invertida, um PDF escaneado deixaria um plano vazio
   * para trás toda vez que ela tentasse.
   *
   * O que continua valendo: só o plano e o anexo são gravados. Unidades,
   * tópicos, datas e grade seguem nascendo apenas quando ela confirma na tela —
   * um plano importado com a unidade 3 errada contamina todo registro que
   * apontar para ela.
   */
  async criarDoDocumento(professorId: string, arquivo: ArquivoRecebido) {
    if (!this.storage.ativo) {
      throw new ServiceUnavailableException(
        'Importação indisponível: falta configurar a chave de serviço do Storage.',
      );
    }

    const proposta = await this.importacao.proporDeArquivo(professorId, null, arquivo.buffer);
    const identidade = identidadeDoPlano(proposta, arquivo.originalname);

    const plano = await this.prisma.planoCurricular.create({
      data: { professorId, ...identidade },
    });

    // Depois de criado, porque o caminho no Storage leva o id do plano. Se
    // falhar, sobra um plano sem documento — que ela preenche à mão, e é bem
    // melhor que perder o upload.
    const anexo = await this.anexos.enviarParaPlano(professorId, plano.id, arquivo);

    return { plano, anexoId: anexo.id, proposta, jaExiste: await this.parecido(professorId, plano) };
  }

  /**
   * Outro plano da mesma disciplina no mesmo período.
   *
   * Avisa, não bloqueia: dois semestres com a mesma disciplina são legítimos, e
   * recusar o segundo seria o sistema decidindo o que é duplicata na carreira
   * dela. Serve para a tela dizer "já existe um assim" com o link, que é o que
   * ela precisa para reconhecer o próprio engano.
   */
  private async parecido(
    professorId: string,
    novo: { id: string; disciplina: string | null; anoLetivo: number; semestre: number | null },
  ) {
    if (!novo.disciplina) return null;

    return this.prisma.planoCurricular.findFirst({
      where: {
        professorId,
        id: { not: novo.id },
        disciplina: novo.disciplina,
        anoLetivo: novo.anoLetivo,
        semestre: novo.semestre,
      },
      select: { id: true, nome: true },
    });
  }

  listar(professorId: string) {
    return this.prisma.planoCurricular.findMany({
      where: { professorId },
      orderBy: [{ anoLetivo: 'desc' }, { nome: 'asc' }],
      include: {
        _count: { select: { unidades: true, cadeiras: true } },
      },
    });
  }

  async buscar(professorId: string, id: string) {
    const plano = await this.prisma.planoCurricular.findFirst({
      where: { id, professorId },
      include: {
        unidades: {
          orderBy: { ordem: 'asc' },
          include: { topicos: { orderBy: { ordem: 'asc' } } },
        },
        cadeiras: {
          select: { id: true, disciplina: true, turma: true, corHex: true },
          orderBy: [{ disciplina: 'asc' }, { turma: 'asc' }],
        },
      },
    });
    if (!plano) throw new NotFoundException('Plano curricular não encontrado.');
    return plano;
  }

  criar(professorId: string, dto: CreatePlanoDto) {
    return this.prisma.planoCurricular.create({ data: { ...dto, professorId } });
  }

  async atualizar(professorId: string, id: string, dto: UpdatePlanoDto) {
    await this.garantirPlano(professorId, id);
    return this.prisma.planoCurricular.update({ where: { id }, data: dto });
  }

  /**
   * Apaga de verdade, ao contrário de `Cadeira`, que só desativa.
   *
   * A diferença é o que pendura embaixo: apagar cadeira levaria junto o
   * histórico de aulas dadas. Aqui o cascade alcança unidades e tópicos — que
   * são currículo, não registro — e `Cadeira.planoCurricularId` é SetNull, então
   * as turmas continuam existindo, só ficam sem plano. O que já foi dado
   * continua em `RegistroAula`.
   */
  async remover(professorId: string, id: string) {
    await this.garantirPlano(professorId, id);
    await this.prisma.planoCurricular.delete({ where: { id } });
    return { ok: true };
  }

  // ---- Unidades -----------------------------------------------------------

  async criarUnidade(professorId: string, planoId: string, dto: CreateUnidadeDto) {
    await this.garantirPlano(professorId, planoId);
    return this.prisma.unidade.create({
      data: {
        professorId,
        planoCurricularId: planoId,
        titulo: dto.titulo,
        ordem: dto.ordem ?? (await this.proximaOrdemUnidade(planoId)),
        dataInicio: data(dto.dataInicio),
        dataFimPrevista: data(dto.dataFimPrevista),
      },
    });
  }

  /**
   * Cria de uma vez as unidades que ela confirmou vindas do documento.
   *
   * Numa transação, e **acrescentando ao fim** em vez de substituir: o plano
   * pode já ter unidade digitada na mão, e importar não é motivo para apagá-la.
   * Se ela importar duas vezes por engano, sobra unidade repetida — que se
   * apaga em dois cliques. O contrário perderia trabalho.
   */
  async importarUnidades(professorId: string, planoId: string, dto: ImportarUnidadesDto) {
    await this.garantirPlano(professorId, planoId);
    let ordem = await this.proximaOrdemUnidade(planoId);

    return this.prisma.$transaction(async (tx) => {
      const criadas = [];
      for (const u of dto.unidades) {
        const unidade = await tx.unidade.create({
          data: {
            professorId,
            planoCurricularId: planoId,
            titulo: u.titulo,
            ordem: ordem++,
            // As datas estimadas entram na criação, e não numa edição depois:
            // são o que liga o aviso de ritmo, e um segundo passo é um passo a
            // mais para falhar no meio, deixando metade das unidades sem prazo.
            dataInicio: data(u.dataInicio),
            dataFimPrevista: data(u.dataFimPrevista),
          },
        });
        if (u.topicos.length) {
          await tx.topico.createMany({
            data: u.topicos.map((titulo, i) => ({ unidadeId: unidade.id, ordem: i + 1, titulo })),
          });
        }
        criadas.push(unidade);
      }
      return { criadas: criadas.length };
    });
  }

  async atualizarUnidade(
    professorId: string,
    planoId: string,
    unidadeId: string,
    dto: UpdateUnidadeDto,
  ) {
    await this.garantirUnidade(professorId, planoId, unidadeId);
    return this.prisma.unidade.update({
      where: { id: unidadeId },
      data: {
        titulo: dto.titulo,
        ordem: dto.ordem,
        dataInicio: data(dto.dataInicio),
        dataFimPrevista: data(dto.dataFimPrevista),
      },
    });
  }

  async removerUnidade(professorId: string, planoId: string, unidadeId: string) {
    await this.garantirUnidade(professorId, planoId, unidadeId);
    await this.prisma.unidade.delete({ where: { id: unidadeId } });
    return { ok: true };
  }

  // ---- Tópicos ------------------------------------------------------------

  async criarTopico(
    professorId: string,
    planoId: string,
    unidadeId: string,
    dto: CreateTopicoDto,
  ) {
    await this.garantirUnidade(professorId, planoId, unidadeId);
    return this.prisma.topico.create({
      data: {
        unidadeId,
        titulo: dto.titulo,
        ordem: dto.ordem ?? (await this.proximaOrdemTopico(unidadeId)),
      },
    });
  }

  async atualizarTopico(
    professorId: string,
    planoId: string,
    unidadeId: string,
    topicoId: string,
    dto: UpdateTopicoDto,
  ) {
    await this.garantirTopico(professorId, planoId, unidadeId, topicoId);
    return this.prisma.topico.update({ where: { id: topicoId }, data: dto });
  }

  async removerTopico(
    professorId: string,
    planoId: string,
    unidadeId: string,
    topicoId: string,
  ) {
    await this.garantirTopico(professorId, planoId, unidadeId, topicoId);
    await this.prisma.topico.delete({ where: { id: topicoId } });
    return { ok: true };
  }

  // ---- Guardas ------------------------------------------------------------
  //
  // Cada uma refaz o filtro por professorId em vez de confiar no id do pai. Num
  // sistema multitenant é a diferença entre "não achei" e vazar dado de outra
  // conta por id adivinhado.

  private async garantirPlano(professorId: string, id: string) {
    const achou = await this.prisma.planoCurricular.findFirst({
      where: { id, professorId },
      select: { id: true },
    });
    if (!achou) throw new NotFoundException('Plano curricular não encontrado.');
  }

  private async garantirUnidade(professorId: string, planoId: string, unidadeId: string) {
    const achou = await this.prisma.unidade.findFirst({
      where: { id: unidadeId, professorId, planoCurricularId: planoId },
      select: { id: true },
    });
    if (!achou) throw new NotFoundException('Unidade não encontrada.');
  }

  private async garantirTopico(
    professorId: string,
    planoId: string,
    unidadeId: string,
    topicoId: string,
  ) {
    const achou = await this.prisma.topico.findFirst({
      where: {
        id: topicoId,
        unidadeId,
        unidade: { professorId, planoCurricularId: planoId },
      },
      select: { id: true },
    });
    if (!achou) throw new NotFoundException('Tópico não encontrado.');
  }

  private async proximaOrdemUnidade(planoId: string) {
    const ultima = await this.prisma.unidade.findFirst({
      where: { planoCurricularId: planoId },
      orderBy: { ordem: 'desc' },
      select: { ordem: true },
    });
    return (ultima?.ordem ?? 0) + 1;
  }

  private async proximaOrdemTopico(unidadeId: string) {
    const ultimo = await this.prisma.topico.findFirst({
      where: { unidadeId },
      orderBy: { ordem: 'desc' },
      select: { ordem: true },
    });
    return (ultimo?.ordem ?? 0) + 1;
  }
}
