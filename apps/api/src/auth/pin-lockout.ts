/** PIN salah berturut-turut yang memicu jeda. */
export const PIN_MAX_ATTEMPTS = 5;
/** Lama jeda setelah PIN salah yang ke-`PIN_MAX_ATTEMPTS`. */
export const PIN_LOCK_MS = 15 * 60 * 1000;

export interface LockState {
  attempts: number;
  lockedUntil: Date | null;
}

/** Keadaan sesudah satu PIN salah. Pada kesalahan ke-5, jeda dimulai dan hitungan kembali ke nol. */
export function afterFailure({ attempts, now }: { attempts: number; now: Date }): LockState {
  const next = attempts + 1;
  if (next < PIN_MAX_ATTEMPTS) return { attempts: next, lockedUntil: null };
  return { attempts: 0, lockedUntil: new Date(now.getTime() + PIN_LOCK_MS) };
}

/** Sisa jeda dalam menit (dibulatkan ke atas), atau null bila tidak sedang dijeda. */
export function lockedFor(lockedUntil: Date | null, now: Date): number | null {
  if (!lockedUntil || lockedUntil <= now) return null;
  return Math.ceil((lockedUntil.getTime() - now.getTime()) / 60_000);
}
