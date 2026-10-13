import { parseReviewOutput } from './review-output.js';

const GOOD = {
  verdict: 'NEEDS_THOUGHT',
  reasons: ['  Sudah punya laptop  ', 'Harga dua kali pemasukan bulanan'],
  suggestion: ' Tunggu 30 hari. ',
};

function text(value: unknown): string {
  return JSON.stringify(value);
}

describe('parseReviewOutput', () => {
  it('reads a valid answer and trims its text', () => {
    expect(parseReviewOutput(text(GOOD))).toEqual({
      verdict: 'NEEDS_THOUGHT',
      reasons: ['Sudah punya laptop', 'Harga dua kali pemasukan bulanan'],
      suggestion: 'Tunggu 30 hari.',
    });
  });

  it('accepts two to four reasons', () => {
    expect(parseReviewOutput(text({ ...GOOD, reasons: ['a', 'b', 'c', 'd'] }))?.reasons).toHaveLength(4);
  });

  it.each([
    ['no text', null],
    ['not JSON', 'Menurut saya ini impulsif'],
    ['an array', '[]'],
    ['an unknown verdict', text({ ...GOOD, verdict: 'MAYBE' })],
    ['one reason', text({ ...GOOD, reasons: ['a'] })],
    ['five reasons', text({ ...GOOD, reasons: ['a', 'b', 'c', 'd', 'e'] })],
    ['an empty reason', text({ ...GOOD, reasons: ['a', '   '] })],
    ['a reason that is not text', text({ ...GOOD, reasons: ['a', 2] })],
    ['a reason over 500 characters', text({ ...GOOD, reasons: ['a', 'x'.repeat(501)] })],
    ['an empty suggestion', text({ ...GOOD, suggestion: '' })],
    ['a suggestion over 1,000 characters', text({ ...GOOD, suggestion: 'x'.repeat(1001) })],
    ['an extra key', text({ ...GOOD, score: 7 })],
    ['a missing key', text({ verdict: 'PLANNED', reasons: ['a', 'b'] })],
  ])('refuses %s', (_label, input) => {
    expect(parseReviewOutput(input)).toBeNull();
  });
});
