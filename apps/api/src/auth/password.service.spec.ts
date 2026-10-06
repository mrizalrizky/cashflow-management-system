import { PasswordService } from './password.service.js';

describe('PasswordService', () => {
  const passwords = new PasswordService();

  it('verifies the right password and rejects a wrong one', async () => {
    const hash = await passwords.hash('rahasia-123');
    expect(await passwords.verify(hash, 'rahasia-123')).toBe(true);
    expect(await passwords.verify(hash, 'rahasia-124')).toBe(false);
  });

  it('never stores the password itself and salts each hash', async () => {
    const first = await passwords.hash('rahasia-123');
    const second = await passwords.hash('rahasia-123');
    expect(first).not.toContain('rahasia-123');
    expect(first).not.toBe(second);
  });

  it('returns false instead of throwing for a malformed hash', async () => {
    expect(await passwords.verify('bukan-hash', 'rahasia-123')).toBe(false);
  });

  it('spends hashing time even when there is no user to check', async () => {
    expect(await passwords.verify(null, 'rahasia-123')).toBe(false);
  });
});
