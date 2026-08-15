import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { ErrosService } from './erros.service';

/**
 * Converte qualquer exceção não tratada numa resposta JSON consistente.
 *
 * O ponto principal é o ramo do 500: sem ele, um erro inesperado devolve a
 * mensagem crua do Prisma ou do driver, que costuma conter nome de tabela,
 * coluna e às vezes trecho de query — informação que não deve sair do servidor.
 *
 * Só 5xx vira ErroLog. 4xx (validação, 401/403/404, rate limit) é tráfego
 * normal, não bug: registrar tudo encheria a tabela de ruído e treinaria a
 * ignorá-la. E o corpo da requisição nunca é gravado — em fase 4 ele carrega
 * transcrição de aula.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  constructor(private readonly erros: ErrosService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const corpo = exception.getResponse();
      return res.status(status).json(
        typeof corpo === 'string' ? { statusCode: status, message: corpo } : corpo,
      );
    }

    const mensagem = exception instanceof Error ? exception.message : String(exception);
    const stack = exception instanceof Error ? exception.stack : undefined;
    const professorId = req?.professor?.id as string | undefined;
    this.logger.error(
      `${req?.method} ${req?.originalUrl} professor=${professorId ?? '-'} → ${mensagem}`,
      stack,
    );

    // `void`: registrar é efeito colateral e não pode atrasar nem derrubar a
    // resposta ao cliente. O ErrosService já é à prova de exceção.
    void this.erros.registrar(
      'http',
      req?.method ?? '?',
      req?.originalUrl ?? '?',
      professorId,
      mensagem,
      stack,
    );

    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Erro interno. Tente de novo em instantes.',
    });
  }
}
