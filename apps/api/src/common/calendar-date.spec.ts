import 'reflect-metadata';
import {
  currentYearInJakarta,
  IsCalendarDate,
  toDate,
  toDateString,
} from './calendar-date.js';
import { validateBody } from './testing/validate.js';

class DateDto {
  @IsCalendarDate()
  date: string;
}

describe('IsCalendarDate', () => {
  it.each(['2026-10-06', '2024-02-29', '1999-12-31'])('accepts %j', async (date) => {
    expect((await validateBody(DateDto, { date })).rejected).toEqual([]);
  });

  it.each([
    ['a day that does not exist', '2026-02-30'],
    ['a leap day in a common year', '2025-02-29'],
    ['a month that does not exist', '2026-13-01'],
    ['day-first order', '06-10-2026'],
    ['a timestamp', '2026-10-06T00:00:00Z'],
    ['a number', 20261006],
    ['an empty string', ''],
    ['null', null],
  ])('rejects %s', async (_label, date) => {
    expect((await validateBody(DateDto, { date })).rejected).toEqual(['date']);
  });
});

describe('calendar date conversion', () => {
  it('round-trips without shifting the day', () => {
    for (const value of ['2026-10-06', '2026-01-01', '2026-12-31']) {
      expect(toDateString(toDate(value))).toBe(value);
    }
    expect(toDate('2026-10-06').toISOString()).toBe('2026-10-06T00:00:00.000Z');
  });
});

describe('currentYearInJakarta', () => {
  it('uses the Jakarta calendar, which is ahead of UTC at year end', () => {
    expect(currentYearInJakarta(new Date('2026-12-31T16:59:59Z'))).toBe(2026);
    expect(currentYearInJakarta(new Date('2026-12-31T17:00:00Z'))).toBe(2027);
  });
});
