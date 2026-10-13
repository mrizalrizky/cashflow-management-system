import Anthropic from '@anthropic-ai/sdk';

/** Token injeksi untuk panggilan ke Claude; test menggantinya dengan tiruan. */
export const AI_MESSAGES = Symbol('AI_MESSAGES');

export const AI_MODEL = 'claude-opus-5-5';
export const AI_TIMEOUT_MS = 60_000;
const MAX_TOKENS = 2000;

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

export interface AiMessages {
  /** Hanya melempar AiTimeoutError atau AiUnavailableError. */
  create(request: AiRequest): Promise<AiResponse>;
}

/** Panggilan sungguhan ke Claude. Satu-satunya tempat SDK dipakai. Isi permintaan tidak pernah dicatat. */
export class AnthropicMessages implements AiMessages {
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    // Tanpa ulangan otomatis: batas 60 detik berlaku untuk seluruh penilaian, bukan per percobaan.
    this.client = new Anthropic({ apiKey, timeout: AI_TIMEOUT_MS, maxRetries: 0 });
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
      throw new AiUnavailableError(error instanceof Error ? error.message : String(error));
    }
  }
}
