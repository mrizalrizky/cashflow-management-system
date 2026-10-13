import { api, setupE2e } from './e2e-context.js';
import { createOwner, loginWithPin, OWNER_PIN, setupPin } from './fixtures.js';
import { HEALTH, REFRESH } from './routes.js';

// Batas e2e bawaan sengaja tinggi; file ini menurunkannya sebelum modul aplikasi dimuat.
// Tiga: lebih kecil dari lima PIN salah yang memicu jeda, supaya yang diuji di sini adalah
// batas per pengunjung, bukan jeda PIN.
vi.hoisted(() => {
  process.env.LOGIN_RATE_LIMIT = '3';
});

const TOO_MANY = {
  statusCode: 429,
  message: 'Terlalu banyak percobaan login. Coba lagi nanti.',
};

describe('PIN rate limit per visitor', () => {
  const ctx = setupE2e();

  it('refuses further attempts from the same address once the limit is reached', async () => {
    await createOwner(ctx.prisma);
    // Batasnya dihitung per rute: membuat PIN tidak mengurangi jatah masuk.
    await setupPin(ctx);

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await loginWithPin(ctx, '999999').expect(401);
    }
    const limited = await loginWithPin(ctx, '999999').expect(429);
    expect(limited.body).toEqual(TOO_MANY);

    // PIN yang benar pun ditolak selama masih dibatasi.
    await loginWithPin(ctx, OWNER_PIN).expect(429);

    // Rute lain tidak ikut dibatasi.
    for (let call = 1; call <= 10; call += 1) {
      await api(ctx).get(HEALTH).expect(200);
    }
    await api(ctx).post(REFRESH).expect(401);
  });
});
