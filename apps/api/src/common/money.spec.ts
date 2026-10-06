import 'reflect-metadata';
import { fromMoney, IsMoneyString, toMoney } from './money.js';
import { validateBody } from './testing/validate.js';

class AmountDto {
  @IsMoneyString()
  amount: string;
}

class SignedAmountDto {
  @IsMoneyString({ allowNegative: true })
  amount: string;
}

describe('IsMoneyString', () => {
  it.each(['0', '1250000', '000123', '9007199254740993', '999999999999999'])(
    'accepts %j',
    async (amount) => {
      expect((await validateBody(AmountDto, { amount })).rejected).toEqual([]);
    },
  );

  it.each([
    ['an empty string', ''],
    ['thousand separators', '1.250.000'],
    ['a decimal', '1250000.50'],
    ['a comma decimal', '1250000,50'],
    ['scientific notation', '1e6'],
    ['surrounding spaces', ' 12 '],
    ['a negative amount', '-5'],
    ['a JSON number', 1250000],
    ['null', null],
    ['a missing value', undefined],
    ['16 digits', '1234567890123456'],
    ['letters', 'seribu'],
  ])('rejects %s', async (_label, amount) => {
    expect((await validateBody(AmountDto, { amount })).rejected).toEqual(['amount']);
  });

  it('accepts a negative amount only when allowed', async () => {
    expect((await validateBody(SignedAmountDto, { amount: '-500000' })).rejected).toEqual([]);
    expect((await validateBody(SignedAmountDto, { amount: '--5' })).rejected).toEqual(['amount']);
    expect((await validateBody(SignedAmountDto, { amount: '-' })).rejected).toEqual(['amount']);
  });
});

describe('toMoney and fromMoney', () => {
  it('round-trips a value larger than a JS number can hold', () => {
    expect(toMoney('9007199254740993')).toBe(9007199254740993n);
    expect(fromMoney(toMoney('9007199254740993'))).toBe('9007199254740993');
  });

  it('drops leading zeros and keeps the sign', () => {
    expect(fromMoney(toMoney('000123'))).toBe('123');
    expect(fromMoney(toMoney('-500000'))).toBe('-500000');
  });
});
