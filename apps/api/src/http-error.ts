import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import { Response } from 'express';
import { ControlError } from './errors';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (exception instanceof ControlError) {
      response.status(exception.status).json({
        ok: false,
        error: exception.code,
        message: exception.message,
      });
      return;
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const message =
        typeof body === 'string'
          ? body
          : typeof body === 'object' && body && 'message' in body
            ? String((body as { message: unknown }).message)
            : 'Request failed.';
      response.status(status).json({ ok: false, error: 'request_failed', message });
      return;
    }
    console.error(exception);
    response.status(500).json({
      ok: false,
      error: 'server_error',
      message: 'Control could not complete that request.',
    });
  }
}
