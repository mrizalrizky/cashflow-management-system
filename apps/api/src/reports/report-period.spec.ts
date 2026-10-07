import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { validateBody } from '../common/testing/validate.js';
import { PeriodQueryDto } from './dto/period-query.dto.js';
import { monthsInPeriod, resolvePeriod } from './report-period.js';

const TODAY = '2026-10-07';

/** Field yang ditolak `resolvePeriod` beserta pesan pertamanya. */
function refusal(query: { from?: string; to?: string }): Record<string, string> {
  try {
    resolvePeriod(query, TODAY);
  } catch (error) {
    if (!(error instanceof BadRequestException)) throw error;
    const { errors } = error.getResponse() as { errors: { field: string; messages: string[] }[] };
    return Object.fromEntries(errors.map((e) => [e.field, e.messages[0]!]));
  }
  throw new Error('Periode diharapkan ditolak');
}

describe('resolvePeriod', () => {
  it('defaults to the current month and the eleven before it', () => {
    expect(resolvePeriod({}, TODAY)).toEqual({ from: '2025-11-01', to: '2026-10-07' });
    expect(resolvePeriod({}, '2026-01-15')).toEqual({ from: '2025-02-01', to: '2026-01-15' });
    expect(resolvePeriod({}, '2026-12-31')).toEqual({ from: '2026-01-01', to: '2026-12-31' });
  });

  it('ends today when only the start is given', () => {
    expect(resolvePeriod({ from: '2026-09-15' }, TODAY)).toEqual({ from: '2026-09-15', to: TODAY });
  });

  it('starts eleven months before the end when only the end is given', () => {
    expect(resolvePeriod({ to: '2026-03-31' }, TODAY)).toEqual({ from: '2025-04-01', to: '2026-03-31' });
  });

  it('uses both dates as given, down to a single day', () => {
    expect(resolvePeriod({ from: '2026-10-01', to: '2026-10-01' }, TODAY)).toEqual({
      from: '2026-10-01',
      to: '2026-10-01',
    });
  });

  it('refuses a period that runs backwards', () => {
    expect(refusal({ from: '2026-10-02', to: '2026-10-01' })).toEqual({
      from: 'Tanggal awal tidak boleh setelah tanggal akhir',
    });
    expect(refusal({ from: '2026-11-01' })).toHaveProperty('from');
  });

  it('accepts sixty calendar months and refuses sixty-one', () => {
    expect(resolvePeriod({ from: '2021-11-30', to: '2026-10-01' }, TODAY)).toEqual({
      from: '2021-11-30',
      to: '2026-10-01',
    });
    expect(refusal({ from: '2021-10-31', to: '2026-10-01' })).toEqual({
      to: 'Rentang paling lama 60 bulan',
    });
  });
});

describe('monthsInPeriod', () => {
  it('lists every month the period touches, in order', () => {
    expect(monthsInPeriod({ from: '2025-11-01', to: '2026-10-07' })).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
    ]);
  });

  it('counts a month touched by a single day', () => {
    expect(monthsInPeriod({ from: '2026-01-31', to: '2026-02-01' })).toEqual(['2026-01', '2026-02']);
    expect(monthsInPeriod({ from: '2026-10-07', to: '2026-10-07' })).toEqual(['2026-10']);
  });
});

describe('PeriodQueryDto', () => {
  it.each([{}, { from: '2026-10-01' }, { to: '2026-10-31' }, { from: '2026-10-01', to: '2026-10-31' }])(
    'accepts %j',
    async (query) => {
      expect((await validateBody(PeriodQueryDto, query)).rejected).toEqual([]);
    },
  );

  it.each([
    ['a month that does not exist', { from: '2026-13-01' }, 'from'],
    ['day-first order', { to: '07-10-2026' }, 'to'],
    ['an empty string', { from: '' }, 'from'],
    ['null', { to: null }, 'to'],
  ])('refuses %s', async (_label, query, field) => {
    expect((await validateBody(PeriodQueryDto, query)).rejected).toEqual([field]);
  });
});
