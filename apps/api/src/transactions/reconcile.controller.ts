import { Body, Controller, Ip, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators.js';
import { ReconcileDto } from './dto/transaction.dto.js';
import { ReconcileResponse, ReconcileService } from './reconcile.service.js';

@Controller('accounts')
export class ReconcileController {
  constructor(private readonly reconcile: ReconcileService) {}

  /** Mencatat selisih antara saldo tercatat dan saldo sebenarnya sebagai satu penyesuaian. */
  @Post(':id/reconcile')
  run(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReconcileDto,
    @Ip() ip: string,
  ): Promise<ReconcileResponse> {
    return this.reconcile.reconcile(user, id, dto, ip);
  }
}
