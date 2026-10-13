import type { User } from '../generated/prisma/client.js';

/** Pemilik yang sedang masuk, seperti yang dikirim ke klien dan ditempel ke request. */
export interface AuthUser {
  id: string;
  name: string;
}

export function toAuthUser(user: User): AuthUser {
  return { id: user.id, name: user.name };
}

/** Hasil masuk, refresh, atau ganti PIN. `refreshToken` hanya untuk cookie. */
export interface Session {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}
