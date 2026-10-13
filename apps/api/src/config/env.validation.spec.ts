import { validateEnv } from './env.validation.js';

const valid = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_ACCESS_SECRET: 'x'.repeat(40),
};

describe('validateEnv', () => {
  it('applies defaults when only the required variables are given', () => {
    const env = validateEnv(valid);
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.DATABASE_URL).toBe(valid.DATABASE_URL);
    expect(env.LOGIN_RATE_LIMIT).toBe(5);
    expect(env.TRUST_PROXY_HOPS).toBe(0);
    expect(env.STORAGE_DIR).toBe('./storage');
  });

  it('converts numeric variables from strings', () => {
    const env = validateEnv({ ...valid, PORT: '4000', LOGIN_RATE_LIMIT: '20', TRUST_PROXY_HOPS: '1' });
    expect(env.PORT).toBe(4000);
    expect(env.LOGIN_RATE_LIMIT).toBe(20);
    expect(env.TRUST_PROXY_HOPS).toBe(1);
  });

  it.each([
    ['a missing DATABASE_URL', { DATABASE_URL: undefined }, /DATABASE_URL/],
    ['an empty DATABASE_URL', { DATABASE_URL: '' }, /DATABASE_URL/],
    ['a non-numeric PORT', { PORT: 'abc' }, /PORT/],
    ['an unknown NODE_ENV', { NODE_ENV: 'staging' }, /NODE_ENV/],
    ['a missing JWT_ACCESS_SECRET', { JWT_ACCESS_SECRET: undefined }, /JWT_ACCESS_SECRET/],
    ['a JWT_ACCESS_SECRET shorter than 32 characters', { JWT_ACCESS_SECRET: 'short' }, /JWT_ACCESS_SECRET/],
    ['a LOGIN_RATE_LIMIT of zero', { LOGIN_RATE_LIMIT: '0' }, /LOGIN_RATE_LIMIT/],
    ['a negative TRUST_PROXY_HOPS', { TRUST_PROXY_HOPS: '-1' }, /TRUST_PROXY_HOPS/],
    ['an implausibly large TRUST_PROXY_HOPS', { TRUST_PROXY_HOPS: '11' }, /TRUST_PROXY_HOPS/],
  ])('rejects %s and names the variable', (_label, override, pattern) => {
    expect(() => validateEnv({ ...valid, ...override })).toThrow(pattern);
  });
});

describe('AI settings', () => {
  it('runs without an Anthropic key and allows 20 reviews a day by default', () => {
    const env = validateEnv(valid);
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.AI_REVIEW_DAILY_LIMIT).toBe(20);
  });

  it('treats an empty key as not set', () => {
    expect(validateEnv({ ...valid, ANTHROPIC_API_KEY: '' }).ANTHROPIC_API_KEY).toBeUndefined();
  });

  it('reads the key and the limit, and refuses a limit below 1', () => {
    expect(validateEnv({ ...valid, ANTHROPIC_API_KEY: 'sk-ant-x', AI_REVIEW_DAILY_LIMIT: '5' })).toMatchObject({
      ANTHROPIC_API_KEY: 'sk-ant-x',
      AI_REVIEW_DAILY_LIMIT: 5,
    });
    expect(() => validateEnv({ ...valid, AI_REVIEW_DAILY_LIMIT: '0' })).toThrow('AI_REVIEW_DAILY_LIMIT');
  });
});
