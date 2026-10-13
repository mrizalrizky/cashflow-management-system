import Anthropic from '@anthropic-ai/sdk';
import { Logger } from '@nestjs/common';

/** Token injeksi untuk panggilan ke Claude; test menggantinya dengan tiruan. */
export const AI_MESSAGES = Symbol('AI_MESSAGES');

export const AI_MODEL = 'claude-opus-5-5';
export const AI_TIMEOUT_MS = 60_000;
/** Opus 5.5 selalu berpikir dulu, dan pikirannya ikut dihitung di sini; yang ditagih hanya yang terpakai. */
const MAX_TOKENS = 16_000;

export interface AiRequest {
  system: string;
  userMessage: string;
  schema: Record<string, unknown>;
}

export interface AiResponse {
  stopReason: string | null;
  /** Blok teks pertama; null bila tidak ada. */
  text: string | null;
  /** Model yang benar-benar menjawab (bisa model fallback). */
  model: string;
}

export class AiTimeoutError extends Error {}
export class AiUnavailableError extends Error {}
/** Kunci ditolak, atau akun tidak punya akses ke model: mengulang tidak akan menolong. */
export class AiConfigError extends Error {}

export interface AiMessages {
  /** Hanya melempar AiTimeoutError, AiConfigError, atau AiUnavailableError. */
  create(request: AiRequest): Promise<AiResponse>;
}

/** Panggilan sungguhan ke Claude. Satu-satunya tempat SDK dipakai. Isi permintaan tidak pernah dicatat. */
export class AnthropicMessages implements AiMessages {
  private readonly client: Anthropic;
  private readonly logger = new Logger(AnthropicMessages.name);

  /** `fetch` dan `timeoutMs` hanya untuk test: tanpa jaringan dan tanpa menunggu 60 detik. */
  constructor(apiKey: string, options: { fetch?: typeof fetch; timeoutMs?: number } = {}) {
    // Tanpa ulangan otomatis: batas 60 detik berlaku untuk seluruh penilaian, bukan per percobaan.
    this.client = new Anthropic({
      apiKey,
      timeout: options.timeoutMs ?? AI_TIMEOUT_MS,
      maxRetries: 0,
      fetch: options.fetch,
    });
  }

  async create(request: AiRequest): Promise<AiResponse> {
    try {
      const response = await this.client.beta.messages.create({
        model: AI_MODEL,
        max_tokens: MAX_TOKENS,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'low', format: { type: 'json_schema', schema: request.schema } },
        system: request.system,
        messages: [{ role: 'user', content: request.userMessage }],
      });
      const block = response.content.find((content) => content.type === 'text');
      return {
        stopReason: response.stop_reason,
        text: block && block.type === 'text' ? block.text : null,
        model: response.model,
      };
    } catch (error) {
      if (error instanceof Anthropic.APIConnectionTimeoutError) throw new AiTimeoutError();
      if (error instanceof Anthropic.APIError) {
        // Hanya status dan nomor permintaan: kunci dan isi permintaan tidak pernah dicatat.
        this.logger.warn(`Panggilan Claude gagal: status ${error.status ?? '-'}, request ${error.requestID ?? '-'}`);
        const config =
          error instanceof Anthropic.AuthenticationError ||
          error instanceof Anthropic.PermissionDeniedError ||
          error instanceof Anthropic.NotFoundError;
        throw config ? new AiConfigError() : new AiUnavailableError();
      }
      this.logger.warn('Panggilan Claude gagal sebelum mendapat jawaban');
      throw new AiUnavailableError();
    }
  }
}
