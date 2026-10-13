import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccountsModule } from '../accounts/accounts.module.js';
import { ReportsModule } from '../reports/reports.module.js';
import { AI_MESSAGES, AiMessages, AnthropicMessages } from './ai/ai-messages.js';
import { AiReviewService } from './ai/ai-review.service.js';
import { FinanceSummaryService } from './finance-summary.service.js';
import { WishlistController } from './wishlist.controller.js';
import { WishlistService } from './wishlist.service.js';

@Module({
  imports: [AccountsModule, ReportsModule],
  controllers: [WishlistController],
  providers: [
    WishlistService,
    FinanceSummaryService,
    AiReviewService,
    {
      // Tanpa kunci tidak ada klien; layanan penilaian menjawab "belum diaktifkan".
      provide: AI_MESSAGES,
      inject: [ConfigService],
      useFactory: (config: ConfigService): AiMessages | null => {
        const key = config.get<string>('ANTHROPIC_API_KEY');
        return key ? new AnthropicMessages(key) : null;
      },
    },
  ],
})
export class WishlistModule {}
