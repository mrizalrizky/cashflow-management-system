import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { TokenService } from './token.service.js';

function createService(secret: string): TokenService {
  const config = { getOrThrow: () => secret } as unknown as ConfigService;
  return new TokenService(new JwtService({}), config);
}

describe('TokenService', () => {
  const tokens = createService('a'.repeat(40));

  afterEach(() => {
    vi.useRealTimers();
  });

  it('signs an access token that verifies back to the user id', async () => {
    const token = await tokens.signAccessToken('user-1');
    expect(await tokens.verifyAccessToken(token)).toMatchObject({ sub: 'user-1' });
  });

  it('rejects a token signed with another secret', async () => {
    const forged = await createService('b'.repeat(40)).signAccessToken('user-1');
    await expect(tokens.verifyAccessToken(forged)).rejects.toThrow();
  });

  it('rejects a token that is not a JWT', async () => {
    await expect(tokens.verifyAccessToken('garbage')).rejects.toThrow();
  });

  it('rejects an access token after 15 minutes', async () => {
    vi.useFakeTimers({ now: new Date('2026-01-01T00:00:00Z') });
    const token = await tokens.signAccessToken('user-1');

    vi.setSystemTime(new Date('2026-01-01T00:14:00Z'));
    await expect(tokens.verifyAccessToken(token)).resolves.toBeDefined();

    vi.setSystemTime(new Date('2026-01-01T00:16:00Z'));
    await expect(tokens.verifyAccessToken(token)).rejects.toThrow();
  });

  it('generates an unguessable refresh token and its hash', () => {
    const first = tokens.generateRefreshToken();
    const second = tokens.generateRefreshToken();
    expect(first.token.length).toBeGreaterThanOrEqual(43);
    expect(first.token).not.toBe(second.token);
    expect(first.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(first.hash).toBe(tokens.hashRefreshToken(first.token));
    expect(first.hash).not.toBe(first.token);
  });

  it('expires refresh tokens after 7 days', () => {
    expect(tokens.refreshExpiry(new Date('2026-01-01T00:00:00Z'))).toEqual(
      new Date('2026-01-08T00:00:00Z'),
    );
  });
});
