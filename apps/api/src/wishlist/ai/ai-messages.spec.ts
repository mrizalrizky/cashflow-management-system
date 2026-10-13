import {
  AI_MODEL,
  AiConfigError,
  AiTimeoutError,
  AiUnavailableError,
  AnthropicMessages,
} from './ai-messages.js';

const REQUEST = { system: 'sistem', userMessage: 'pesan', schema: { type: 'object' } };

const MESSAGE = {
  id: 'msg_1',
  type: 'message',
  role: 'assistant',
  model: 'claude-opus-5-5',
  content: [{ type: 'text', text: '{"verdict":"PLANNED"}' }],
  stop_reason: 'end_turn',
  stop_sequence: null,
  usage: { input_tokens: 10, output_tokens: 20 },
};

interface Sent {
  url: string;
  headers: Headers;
  body: Record<string, unknown>;
}

/** fetch tiruan: tidak ada panggilan jaringan; permintaan dicatat, jawaban disiapkan. */
function stubFetch(respond: () => Response | Promise<Response>, sent: Sent[] = []) {
  const fetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    sent.push({
      url: String(url),
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    });
    return respond();
  };
  return { fetch, sent };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'request-id': 'req_123' },
  });
}

function apiError(status: number, type: string): Response {
  return json(status, { type: 'error', error: { type, message: 'nope' } });
}

describe('AnthropicMessages', () => {
  it('asks Opus 5.5 at low effort for structured output, with the default server-side fallback', async () => {
    const { fetch, sent } = stubFetch(() => json(200, MESSAGE));
    const ai = new AnthropicMessages('test-key', { fetch });

    const response = await ai.create(REQUEST);

    expect(response).toEqual({ stopReason: 'end_turn', text: '{"verdict":"PLANNED"}', model: 'claude-opus-5-5' });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.url).toContain('/v1/messages');
    expect(sent[0]!.headers.get('anthropic-beta')).toBe('server-side-fallback-2026-07-01');
    expect(sent[0]!.body).toMatchObject({
      model: AI_MODEL,
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: REQUEST.schema } },
      system: 'sistem',
      messages: [{ role: 'user', content: 'pesan' }],
    });
    // Opus 5.5 selalu berpikir dulu, dan pikirannya ikut dihitung di max_tokens.
    expect(sent[0]!.body.max_tokens).toBeGreaterThanOrEqual(8000);
  });

  it('reads the first text block, after a fallback block', async () => {
    const { fetch } = stubFetch(() =>
      json(200, {
        ...MESSAGE,
        model: 'claude-opus-4-8',
        content: [
          { type: 'fallback', from: { model: 'claude-opus-5-5' }, to: { model: 'claude-opus-4-8' } },
          { type: 'text', text: '{"ok":true}' },
        ],
      }),
    );
    const response = await new AnthropicMessages('test-key', { fetch }).create(REQUEST);
    expect(response).toMatchObject({ text: '{"ok":true}', model: 'claude-opus-4-8' });
  });

  it('turns a timeout into AiTimeoutError', async () => {
    const fetch = (_url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      });
    const ai = new AnthropicMessages('test-key', { fetch, timeoutMs: 20 });
    await expect(ai.create(REQUEST)).rejects.toBeInstanceOf(AiTimeoutError);
  });

  it.each([
    [401, 'authentication_error'],
    [403, 'permission_error'],
    [404, 'not_found_error'],
  ])('turns a %i (key or model access) into AiConfigError', async (status, type) => {
    const { fetch } = stubFetch(() => apiError(status, type));
    await expect(new AnthropicMessages('test-key', { fetch }).create(REQUEST)).rejects.toBeInstanceOf(AiConfigError);
  });

  it.each([
    [500, 'api_error'],
    [529, 'overloaded_error'],
    [400, 'invalid_request_error'],
  ])('turns a %i into AiUnavailableError, and does not retry', async (status, type) => {
    const { fetch, sent } = stubFetch(() => apiError(status, type));
    await expect(new AnthropicMessages('test-key', { fetch }).create(REQUEST)).rejects.toBeInstanceOf(
      AiUnavailableError,
    );
    expect(sent).toHaveLength(1);
  });
});
