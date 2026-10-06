import { containsText } from './search.js';

describe('containsText', () => {
  it('passes ordinary text through, case-insensitively', () => {
    expect(containsText('Budi')).toEqual({ contains: 'Budi', mode: 'insensitive' });
  });

  it('escapes LIKE wildcards and the escape character itself', () => {
    expect(containsText('50%_a\\b').contains).toBe('50\\%\\_a\\\\b');
  });
});
