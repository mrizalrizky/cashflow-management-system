import type { AiMessages, AiRequest, AiResponse } from '../src/wishlist/ai/ai-messages.js';

/** Pengganti Claude di test: jawaban disiapkan lebih dulu, dan setiap permintaan dicatat. */
export class FakeAi implements AiMessages {
  readonly requests: AiRequest[] = [];
  private next: (() => Promise<AiResponse>)[] = [];

  answer(output: unknown, model = 'claude-opus-5-5'): this {
    this.next.push(async () => ({ stopReason: 'end_turn', text: JSON.stringify(output), model }));
    return this;
  }

  /** Menjalankan `during` selagi "AI berpikir", lalu menjawab; mis. pemilik mengubah barang di tab lain. */
  answerAfter(during: () => Promise<unknown>, output: unknown, model = 'claude-opus-5-5'): this {
    this.next.push(async () => {
      await during();
      return { stopReason: 'end_turn', text: JSON.stringify(output), model };
    });
    return this;
  }

  raw(response: AiResponse): this {
    this.next.push(async () => response);
    return this;
  }

  fail(error: Error): this {
    this.next.push(async () => {
      throw error;
    });
    return this;
  }

  reset(): void {
    this.requests.length = 0;
    this.next = [];
  }

  async create(request: AiRequest): Promise<AiResponse> {
    this.requests.push(request);
    const step = this.next.shift();
    if (!step) throw new Error('FakeAi: tidak ada jawaban yang disiapkan');
    return step();
  }
}
