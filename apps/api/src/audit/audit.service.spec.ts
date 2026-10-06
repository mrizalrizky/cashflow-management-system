import { sanitizeForAudit } from './audit.service.js';

describe('sanitizeForAudit', () => {
  it('removes secret fields at any depth', () => {
    const input = {
      id: '1',
      password_hash: 'secret',
      nested: { token_hash: 'secret', keep: 'yes' },
      list: [{ password_hash: 'secret', name: 'a' }],
    };
    expect(sanitizeForAudit(input)).toEqual({
      id: '1',
      nested: { keep: 'yes' },
      list: [{ name: 'a' }],
    });
  });

  it('converts bigint to an exact string', () => {
    expect(sanitizeForAudit({ amount: 9007199254740993n })).toEqual({
      amount: '9007199254740993',
    });
  });

  it('converts dates to ISO strings', () => {
    expect(sanitizeForAudit({ at: new Date('2026-10-06T01:02:03.000Z') })).toEqual({
      at: '2026-10-06T01:02:03.000Z',
    });
  });

  it('leaves primitives, null and undefined as they are', () => {
    expect(sanitizeForAudit('teks')).toBe('teks');
    expect(sanitizeForAudit(5)).toBe(5);
    expect(sanitizeForAudit(null)).toBeNull();
    expect(sanitizeForAudit(undefined)).toBeUndefined();
  });

  it('does not modify its input', () => {
    const input = { password_hash: 'secret', name: 'a' };
    sanitizeForAudit(input);
    expect(input).toEqual({ password_hash: 'secret', name: 'a' });
  });
});
