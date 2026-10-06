import { api, setupE2e } from './e2e-context.js';
import { createUser, DEFAULT_PASSWORD } from './fixtures.js';

// Batas e2e bawaan sengaja tinggi; file ini menurunkannya sebelum modul aplikasi dimuat.
vi.hoisted(() => {
  process.env.LOGIN_RATE_LIMIT = '3';
});

const LOGIN = '/api/v1/auth/login';
const TOO_MANY = {
  statusCode: 429,
  message: 'Terlalu banyak percobaan login. Coba lagi nanti.',
};

describe('login rate limit', () => {
  const ctx = setupE2e();

  it('refuses further attempts from the same address once the limit is reached', async () => {
    const user = await createUser(ctx.prisma);
    const wrong = { email: user.email, password: 'salah-salah' };

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await api(ctx).post(LOGIN).send(wrong).expect(401);
    }
    const limited = await api(ctx).post(LOGIN).send(wrong).expect(429);
    expect(limited.body).toEqual(TOO_MANY);

    // Password yang benar pun ditolak selama masih dibatasi.
    await api(ctx).post(LOGIN).send({ email: user.email, password: DEFAULT_PASSWORD }).expect(429);

    // Rute lain tidak ikut dibatasi.
    for (let call = 1; call <= 10; call += 1) {
      await api(ctx).get('/api/v1/health').expect(200);
    }
    await api(ctx).post('/api/v1/auth/refresh').expect(401);
  });
});
