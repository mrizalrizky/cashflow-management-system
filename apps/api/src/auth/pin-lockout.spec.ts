import { afterFailure, lockedFor, PIN_LOCK_MS, PIN_MAX_ATTEMPTS } from './pin-lockout.js';

const NOW = new Date('2026-10-12T03:00:00.000Z');

describe('pin lockout', () => {
  it('counts a wrong PIN without locking before the fifth', () => {
    expect(afterFailure({ attempts: 3, now: NOW })).toEqual({ attempts: 4, lockedUntil: null });
  });

  it('locks for 15 minutes on the fifth wrong PIN and starts counting again from zero', () => {
    expect(afterFailure({ attempts: PIN_MAX_ATTEMPTS - 1, now: NOW })).toEqual({
      attempts: 0,
      lockedUntil: new Date(NOW.getTime() + PIN_LOCK_MS),
    });
  });

  it('reports the remaining minutes, rounded up, while locked', () => {
    const lockedUntil = new Date(NOW.getTime() + 61_000);
    expect(lockedFor(lockedUntil, NOW)).toBe(2);
  });

  it('is not locked once the pause has passed', () => {
    expect(lockedFor(new Date(NOW.getTime() - 1), NOW)).toBeNull();
    expect(lockedFor(null, NOW)).toBeNull();
  });
});
