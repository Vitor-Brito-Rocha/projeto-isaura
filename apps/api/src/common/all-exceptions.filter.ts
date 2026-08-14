import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

/**
 * Converte qualquer exceção não tratada numa resposta JSON consistente.
 *
 * O ponto principal é o ramo do 500: sem ele, um erro inesperado devolve a
 * mensagem crua do Prisma ou do driver, que costuma conter nome de tabela,
 * coluna e às vezes trecho de query — informação que não deve sair do servidor.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

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
    this.logger.error(`${req?.method} ${req?.originalUrl} → ${mensagem}`, stack);

    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Erro interno. Tente de novo em instantes.',
    });
  }
}
