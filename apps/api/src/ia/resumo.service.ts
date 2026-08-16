import {
  BadGatewayException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ErrosService } from '../common/erros.service';
import { PrismaService } from '../prisma/prisma.service';
import { ModeloService } from './modelo.service';
import { type Provedor } from './provedor';
import {
  aplicarResumo,
  montarEsquema,
  montarPrompt,
  SISTEMA,
  type ResumoBruto,
  type UnidadeContexto,
} from './resumo.prompt';

@Injectable()
export class ResumoService {
  private readonly logger = new Logger(ResumoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly erros: ErrosService,
    private readonly modelo: ModeloService,
  ) {}

  /** Sem provedor configurado o recurso fica inativo, sem derrubar o boot. */
  get ativo(): boolean {
    return this.modelo.ativo;
  }

  get provedorAtual(): Provedor | null {
    return this.modelo.provedorAtual;
  }

  async gerar(professorId: string, ocorrenciaId: string, transcricao: string) {
    if (!this.ativo) {
      throw new ServiceUnavailableException(
        'Resumo por voz indisponível: nenhum provedor de IA configurado.',
      );
    }

    const ocorrencia = await this.prisma.ocorrencia.findFirst({
      where: { id: ocorrenciaId, professorId },
      include: {
        cadeira: {
          include: {
            plano: {
              include: {
                unidades: {
                  orderBy: { ordem: 'asc' },
                  include: { topicos: { orderBy: { ordem: 'asc' } } },
                },
              },
            },
          },
        },
        registro: { select: { planoPrevisto: true } },
      },
    });
    if (!ocorrencia) throw new NotFoundException('Aula não encontrada.');

    const unidades: UnidadeContexto[] = (ocorrencia.cadeira.plano?.unidades ?? []).map((u) => ({
      id: u.id,
      titulo: u.titulo,
      topicos: u.topicos.map((t) => ({ id: t.id, titulo: t.titulo })),
    }));

    const prompt = montarPrompt(
      {
        disciplina: ocorrencia.cadeira.disciplina,
        turma: ocorrencia.cadeira.turma,
        anoLetivo: ocorrencia.cadeira.anoLetivo,
        data: ocorrencia.data,
        horaInicio: ocorrencia.horaInicio,
        horaFim: ocorrencia.horaFim,
        planoPrevisto: ocorrencia.registro?.planoPrevisto ?? null,
        unidades,
      },
      transcricao,
    );

    // O schema depende das unidades desta cadeira: os números válidos entram
    // como `enum`, e é isso que impede o modelo de pedir um tópico que não
    // existe. Ver `montarEsquema`.
    const bruto = await this.chamar(professorId, ocorrenciaId, prompt, montarEsquema(unidades));
    const rascunho = aplicarResumo(bruto, unidades);

    // Grava como RASCUNHO: a fala original e a saída da IA entram no registro,
    // mas nenhum campo do fechamento é escrito e `revisadoEm` continua nulo.
    // Quem promove isto a registro é ela, salvando o formulário.
    await this.prisma.registroAula.upsert({
      where: { ocorrenciaId },
      create: {
        professorId,
        ocorrenciaId,
        transcricaoBruta: transcricao,
        resumoPadronizado: JSON.stringify(rascunho),
      },
      update: {
        transcricaoBruta: transcricao,
        resumoPadronizado: JSON.stringify(rascunho),
        // Ditar de novo desfaz a revisão anterior: o que está na tela voltou a
        // ser saída de modelo, e não pode continuar contando como conferido.
        revisadoEm: null,
      },
      select: { id: true },
    });

    return { rascunho, transcricao, provedor: this.provedorAtual };
  }

  private async chamar(
    professorId: string,
    ocorrenciaId: string,
    prompt: string,
    esquema: Record<string, unknown>,
  ): Promise<ResumoBruto> {
    try {
      const json = await this.modelo.pedirJson({
        sistema: SISTEMA,
        prompt,
        esquema,
        nome: 'resumo_da_aula',
        erroDeTamanho: 'A fala ficou longa demais para resumir. Tente em partes.',
      });
      return JSON.parse(json) as ResumoBruto;
    } catch (e) {
      if (e instanceof BadGatewayException) throw e;

      const mensagem = e instanceof Error ? e.message : String(e);
      this.logger.error(`Resumo falhou para ocorrência ${ocorrenciaId}: ${mensagem}`);
      await this.erros.registrar(
        `ResumoService:${this.provedorAtual}`,
        'POST',
        `/ia/ocorrencia/${ocorrenciaId}/resumo`,
        professorId,
        mensagem,
        e instanceof Error ? e.stack : undefined,
      );
      throw new BadGatewayException('Não foi possível gerar o resumo agora. O texto continua seu.');
    }
  }
}
