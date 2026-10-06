import { installBigIntJson } from './bigint-json.js';

describe('installBigIntJson', () => {
  it('serialises bigint as an exact decimal string', () => {
    installBigIntJson();
    // 2^53 + 1 cannot be represented as a JS number.
    expect(JSON.stringify({ amount: 9007199254740993n })).toBe('{"amount":"9007199254740993"}');
  });

  it('serialises zero and nested values', () => {
    installBigIntJson();
    expect(JSON.stringify({ a: 0n, b: [1n, { c: 1250000n }] })).toBe(
      '{"a":"0","b":["1",{"c":"1250000"}]}',
    );
  });
});
