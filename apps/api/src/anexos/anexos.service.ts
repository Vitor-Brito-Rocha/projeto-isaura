import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { TipoAnexo } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from './storage.service';

/** O mesmo teto do bucket. Repetido aqui para recusar antes de gastar rede. */
export const TAMANHO_MAXIMO = 10 * 1024 * 1024;

const TIPOS_PERMITIDOS: Record<string, TipoAnexo> = {
  'image/jpeg': TipoAnexo.FOTO,
  'image/png': TipoAnexo.FOTO,
  'image/webp': TipoAnexo.FOTO,
  'image/heic': TipoAnexo.FOTO,
  'application/pdf': TipoAnexo.DOCUMENTO,
};

export interface ArquivoRecebido {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/**
 * Sanitiza o nome vindo do aparelho.
 *
 * O nome do arquivo entra no caminho do Storage, então `../` ou barra ali
 * escaparia da pasta do professor — que é exatamente a fronteira do
 * multitenant. O uuid na frente também evita colisão entre duas fotos
 * chamadas "image.jpg".
 */
function nomeSeguro(bruto: string): string {
  const base = bruto.split(/[\\/]/).pop() ?? 'arquivo';
  return base.replace(/[^\w.\-]/g, '_').slice(0, 120) || 'arquivo';
}

@Injectable()
export class AnexosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async listar(professorId: string, ocorrenciaId: string) {
    const registro = await this.registroDaOcorrencia(professorId, ocorrenciaId);
    if (!registro) return [];

    const anexos = await this.prisma.anexo.findMany({
      where: { registroId: registro.id, professorId },
      orderBy: { criadoEm: 'asc' },
    });

    // A URL é assinada na leitura, e não guardada: ela expira, e uma URL
    // vencida no banco seria um link quebrado que ninguém sabe consertar.
    return Promise.all(
      anexos.map(async (a) => ({
        id: a.id,
        tipo: a.tipo,
        nomeArquivo: a.nomeArquivo,
        tamanhoBytes: a.tamanhoBytes,
        criadoEm: a.criadoEm,
        url: this.storage.ativo ? await this.storage.urlAssinada(a.storagePath) : null,
      })),
    );
  }

  async enviar(professorId: string, ocorrenciaId: string, arquivo: ArquivoRecebido) {
    if (!this.storage.ativo) {
      throw new ServiceUnavailableException(
        'Anexos indisponíveis: falta configurar a chave de serviço do Storage.',
      );
    }
    if (!arquivo?.buffer?.length) throw new BadRequestException('Arquivo vazio.');
    if (arquivo.size > TAMANHO_MAXIMO) {
      throw new BadRequestException('Arquivo maior que 10 MB.');
    }

    const tipo = TIPOS_PERMITIDOS[arquivo.mimetype];
    if (!tipo) throw new BadRequestException('Tipo de arquivo não aceito (use foto ou PDF).');

    // O registro pode não existir ainda: ela pode fotografar o quadro antes de
    // escrever qualquer coisa. Criar aqui mantém a tela sem ordem obrigatória.
    const registro = await this.garantirRegistro(professorId, ocorrenciaId);

    const nome = nomeSeguro(arquivo.originalname);
    const caminho = `${professorId}/${registro.id}/${randomUUID()}-${nome}`;

    await this.storage.enviar(caminho, arquivo.buffer, arquivo.mimetype);

    // Só grava a linha DEPOIS que o objeto está no Storage: o contrário
    // produziria anexo que a tela lista e ninguém consegue abrir.
    return this.prisma.anexo.create({
      data: {
        professorId,
        registroId: registro.id,
        tipo,
        nomeArquivo: nome,
        storagePath: caminho,
        tamanhoBytes: arquivo.size,
        enviadoEm: new Date(),
      },
      select: { id: true, tipo: true, nomeArquivo: true, tamanhoBytes: true, criadoEm: true },
    });
  }

  async remover(professorId: string, anexoId: string) {
    const anexo = await this.prisma.anexo.findFirst({
      where: { id: anexoId, professorId },
    });
    if (!anexo) throw new NotFoundException('Anexo não encontrado.');

    // Banco primeiro: se o Storage falhar, sobra um objeto órfão — bem melhor
    // que uma linha apontando para arquivo que não existe mais.
    await this.prisma.anexo.delete({ where: { id: anexoId } });
    if (this.storage.ativo) await this.storage.remover(anexo.storagePath);
    return { ok: true };
  }

  /**
   * Apaga os áudios de um registro.
   *
   * Chamado quando o fechamento é revisado. A transcrição em texto ficou (ela
   * pode querer reconferir depois), mas o áudio não: voz é identificador
   * biométrico, e de menor. Guardar a frase "a Ana perguntou" é uma coisa;
   * guardar a voz da Ana é outra. Ver "LGPD" em docs/PLANO.md.
   *
   * Objeto órfão no Storage seria justamente o que a regra proíbe, então aqui
   * a ordem se inverte em relação a `remover`: some do bucket primeiro.
   */
  async descartarAudios(professorId: string, registroId: string): Promise<number> {
    const audios = await this.prisma.anexo.findMany({
      where: { registroId, professorId, tipo: TipoAnexo.AUDIO },
      select: { id: true, storagePath: true },
    });
    if (!audios.length) return 0;

    if (this.storage.ativo) {
      await Promise.all(audios.map((a) => this.storage.remover(a.storagePath)));
    }
    await this.prisma.anexo.deleteMany({ where: { id: { in: audios.map((a) => a.id) } } });
    return audios.length;
  }

  private async registroDaOcorrencia(professorId: string, ocorrenciaId: string) {
    return this.prisma.registroAula.findFirst({
      where: { ocorrenciaId, professorId },
      select: { id: true },
    });
  }

  private async garantirRegistro(professorId: string, ocorrenciaId: string) {
    const ocorrencia = await this.prisma.ocorrencia.findFirst({
      where: { id: ocorrenciaId, professorId },
      select: { id: true },
    });
    if (!ocorrencia) throw new NotFoundException('Aula não encontrada.');

    return this.prisma.registroAula.upsert({
      where: { ocorrenciaId },
      create: { professorId, ocorrenciaId },
      update: {},
      select: { id: true },
    });
  }
}
