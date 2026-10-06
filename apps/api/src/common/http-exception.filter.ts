import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

export interface ErrorBody {
  statusCode: number;
  message: string;
  errors?: unknown;
}

function toErrorBody(exception: HttpException): ErrorBody {
  const payload = exception.getResponse();
  const body: ErrorBody = { statusCode: exception.getStatus(), message: exception.message };

  if (typeof payload === 'string') {
    body.message = payload;
  } else if (payload && typeof payload === 'object') {
    const { message, errors } = payload as { message?: unknown; errors?: unknown };
    if (Array.isArray(message)) body.message = message.join('; ');
    else if (typeof message === 'string') body.message = message;
    if (errors !== undefined) body.errors = errors;
  }
  return body;
}

/** Semua error keluar sebagai `{ statusCode, message, errors? }`. */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const body = toErrorBody(exception);
      res.status(body.statusCode).json(body);
      return;
    }

    // Detail error tak terduga hanya masuk log, tidak pernah ke klien.
    this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    const body: ErrorBody = {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Terjadi kesalahan pada server',
    };
    res.status(body.statusCode).json(body);
  }
}
