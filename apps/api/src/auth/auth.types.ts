import type { Role, User } from '../generated/prisma/client.js';

/** User yang sedang login, seperti yang dikirim ke klien dan ditempel ke request. */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  mustChangePassword: boolean;
}

export function toAuthUser(user: User): AuthUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    mustChangePassword: user.must_change_password,
  };
}

/** Hasil login, refresh, atau ganti password. `refreshToken` hanya untuk cookie. */
export interface Session {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}
