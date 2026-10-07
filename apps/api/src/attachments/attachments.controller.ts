import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  Controller,
  Delete,
  ExceptionFilter,
  Get,
  Header,
  HttpCode,
  Ip,
  Param,
  ParseUUIDPipe,
  PayloadTooLargeException,
  Post,
  StreamableFile,
  UploadedFile,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators.js';
import { AttachmentResponse, toAttachmentResponse } from '../transactions/transaction.mapper.js';
import { AttachmentsService, MAX_FILE_BYTES, ProofFile } from './attachments.service.js';

const MAX_FILE_MB = MAX_FILE_BYTES / 1024 / 1024;

/** Batas ukuran ditolak oleh pengurai unggahan dengan pesan bahasa Inggris; ini menggantinya. */
@Catch(PayloadTooLargeException)
class UploadTooLargeFilter implements ExceptionFilter {
  catch(_exception: PayloadTooLargeException, host: ArgumentsHost): void {
    const statusCode = 413;
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(statusCode)
      .json({ statusCode, message: `Berkas terlalu besar (maksimal ${MAX_FILE_MB} MB)` });
  }
}

@Controller()
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Post('transactions/:id/attachments')
  @UseFilters(UploadTooLargeFilter)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES, files: 1 } }))
  async upload(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) transactionId: string,
    @UploadedFile() file: ProofFile | undefined,
    @Ip() ip: string,
  ): Promise<AttachmentResponse> {
    if (!file) throw new BadRequestException('Berkas wajib diunggah');
    return toAttachmentResponse(await this.attachments.upload(user, transactionId, file, ip));
  }

  @Get('attachments/:id/download')
  // Browser tidak boleh menebak sendiri jenis berkas dari isinya.
  @Header('X-Content-Type-Options', 'nosniff')
  async download(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StreamableFile> {
    const { attachment, stream } = await this.attachments.open(user, id);
    return new StreamableFile(stream, {
      type: attachment.mime_type,
      // Selalu sebagai unduhan, tidak pernah ditampilkan langsung dari alamat API.
      disposition: `attachment; filename="${attachment.file_name}"`,
      length: attachment.size_bytes,
    });
  }

  @Delete('attachments/:id')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Ip() ip: string,
  ): Promise<void> {
    await this.attachments.remove(user, id, ip);
  }
}
