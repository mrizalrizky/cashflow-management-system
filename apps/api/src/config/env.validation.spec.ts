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
  ])('rejects %s and names the variable', (_label, override, pattern) => {
    expect(() => validateEnv({ ...valid, ...override })).toThrow(pattern);
  });
});
