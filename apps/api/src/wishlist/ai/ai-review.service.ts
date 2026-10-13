import {
  BadGatewayException,
  GatewayTimeoutException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../../audit/audit.service.js';
import type { AuthUser } from '../../auth/auth.types.js';
import { startOfJakartaDay, todayInJakarta } from '../../common/calendar-date.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma, WishlistItem } from '../../generated/prisma/client.js';
import { FinanceSummaryService } from '../finance-summary.service.js';
import type { FinanceSummary } from '../finance-summary.js';
import { toWishlistAnswers, toWishlistItemResponse, toWishlistSnapshot, WishlistItemResponse } from '../wishlist.mapper.js';
import { WISHLIST_ENTITY, wishlistItemNotFound } from '../wishlist.service.js';
import { AI_MESSAGES, AiMessages, AiResponse, AiTimeoutError } from './ai-messages.js';
import { parseReviewOutput, ReviewOutput } from './review-output.js';
import { buildReviewMessage, REVIEW_SCHEMA, REVIEW_SYSTEM_PROMPT } from './review-prompt.js';

/**
 * "Minta pendapat AI". Penilaian yang gagal tidak mengubah barang, tidak ditulis ke log audit,
 * dan karena itu tidak dihitung ke batas harian, yang dihitung dari log audit.
 */
@Injectable()
export class AiReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly finance: FinanceSummaryService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    @Inject(AI_MESSAGES) private readonly ai: AiMessages | null,
  ) {}

  async review(actor: AuthUser, id: string, ip: string | null): Promise<WishlistItemResponse> {
    if (!this.ai || !this.config.get<string>('ANTHROPIC_API_KEY')) {
      throw new ServiceUnavailableException('Penilaian AI belum diaktifkan di server.');
    }
    const item = await this.prisma.wishlistItem.findUnique({ where: { id } });
    if (!item) throw wishlistItemNotFound();

    const limit = this.config.getOrThrow<number>('AI_REVIEW_DAILY_LIMIT');
    if ((await this.reviewsToday()) >= limit) {
      throw new HttpException(
        `Batas penilaian AI hari ini (${limit}) sudah tercapai. Coba lagi besok.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const finance = item.include_finance ? await this.finance.summarize() : null;
    const { output, model } = await this.ask(this.ai, item, finance);

    return this.prisma.$transaction(async (tx) => {
      const saved = await tx.wishlistItem.update({
        where: { id },
        data: {
          ai_verdict: output.verdict,
          ai_reasons: output.reasons,
          ai_suggestion: output.suggestion,
          ai_finance_snapshot: finance === null ? Prisma.DbNull : (finance as unknown as Prisma.InputJsonObject),
          ai_reviewed_at: new Date(),
          ai_model: model,
        },
      });
      await this.audit.log(tx, {
        userId: actor.id,
        action: 'AI_REVIEW',
        entityType: WISHLIST_ENTITY,
        entityId: id,
        before: toWishlistSnapshot(item),
        after: toWishlistSnapshot(saved),
        ip,
      });
      return toWishlistItemResponse(saved);
    });
  }

  private async ask(
    ai: AiMessages,
    item: WishlistItem,
    finance: FinanceSummary | null,
  ): Promise<{ output: ReviewOutput; model: string }> {
    let response: AiResponse;
    try {
      response = await ai.create({
        system: REVIEW_SYSTEM_PROMPT,
        userMessage: buildReviewMessage(toWishlistAnswers(item), finance),
        schema: REVIEW_SCHEMA,
      });
    } catch (error) {
      if (error instanceof AiTimeoutError) {
        throw new GatewayTimeoutException('AI tidak menjawab dalam 60 detik. Coba lagi.');
      }
      throw new BadGatewayException('Layanan AI sedang bermasalah. Coba lagi nanti.');
    }
    // Penolakan di sini berarti model fallback pun menolak.
    if (response.stopReason === 'refusal') throw new BadGatewayException('AI menolak menilai barang ini.');
    const output = parseReviewOutput(response.text);
    if (!output) throw new BadGatewayException('Jawaban AI tidak bisa dibaca. Coba lagi.');
    return { output, model: response.model };
  }

  /** Penilaian yang berhasil sejak tengah malam Jakarta. */
  private reviewsToday(): Promise<number> {
    return this.prisma.auditLog.count({
      where: { action: 'AI_REVIEW', created_at: { gte: startOfJakartaDay(todayInJakarta()) } },
    });
  }
}
