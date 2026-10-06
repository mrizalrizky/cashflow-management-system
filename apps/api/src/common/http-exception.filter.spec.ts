import {
  ArgumentsHost,
  BadRequestException,
  HttpException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter.js';

function run(exception: unknown): { status: number; body: Record<string, unknown> } {
  const captured = { status: 0, body: {} as Record<string, unknown> };
  const res = {
    status(code: number) {
      captured.status = code;
      return res;
    },
    json(body: Record<string, unknown>) {
      captured.body = body;
      return res;
    },
  };
  const host = { switchToHttp: () => ({ getResponse: () => res }) } as unknown as ArgumentsHost;
  new HttpExceptionFilter().catch(exception, host);
  return captured;
}

describe('HttpExceptionFilter', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reduces a standard HTTP exception to statusCode and message', () => {
    const { status, body } = run(new NotFoundException('Pengguna tidak ditemukan'));
    expect(status).toBe(404);
    expect(body).toEqual({ statusCode: 404, message: 'Pengguna tidak ditemukan' });
  });

  it('accepts an exception created with a plain string response', () => {
    const { body } = run(new HttpException('Sibuk', 503));
    expect(body).toEqual({ statusCode: 503, message: 'Sibuk' });
  });

  it('keeps field errors', () => {
    const errors = [{ field: 'email', messages: ['email must be an email'] }];
    const { body } = run(new BadRequestException({ message: 'Validasi gagal', errors }));
    expect(body).toEqual({ statusCode: 400, message: 'Validasi gagal', errors });
  });

  it('joins an array message into one string', () => {
    const { body } = run(new BadRequestException({ message: ['a salah', 'b salah'] }));
    expect(body).toEqual({ statusCode: 400, message: 'a salah; b salah' });
  });

  it('hides the details of an unexpected error', () => {
    const { status, body } = run(new Error('boom: password=rahasia'));
    expect(status).toBe(500);
    expect(body).toEqual({ statusCode: 500, message: 'Terjadi kesalahan pada server' });
  });
});
