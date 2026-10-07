import 'reflect-metadata';
import {
  currentYearInJakarta,
  IsCalendarDate,
  formatCalendarDate,
  endOfJakartaDay,
  parseCalendarDate,
  startOfJakartaDay,
  todayInJakarta,
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
    ['year zero', '0000-01-01'],
    ['a year far in the past', '1899-12-31'],
    ['a year far in the future', '3000-01-01'],
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
      expect(formatCalendarDate(parseCalendarDate(value))).toBe(value);
    }
    expect(parseCalendarDate('2026-10-06').toISOString()).toBe('2026-10-06T00:00:00.000Z');
  });
});

describe('currentYearInJakarta', () => {
  it('uses the Jakarta calendar, which is ahead of UTC at year end', () => {
    expect(currentYearInJakarta(new Date('2026-12-31T16:59:59Z'))).toBe(2026);
    expect(currentYearInJakarta(new Date('2026-12-31T17:00:00Z'))).toBe(2027);
  });
});

describe('todayInJakarta', () => {
  it('follows the Jakarta calendar, seven hours ahead of UTC', () => {
    expect(todayInJakarta(new Date('2026-10-06T16:59:59Z'))).toBe('2026-10-06');
    expect(todayInJakarta(new Date('2026-10-06T17:00:00Z'))).toBe('2026-10-07');
  });
});

describe('Jakarta day boundaries', () => {
  it('start seven hours before the same date in UTC and end a day later', () => {
    expect(startOfJakartaDay('2026-10-06').toISOString()).toBe('2026-10-05T17:00:00.000Z');
    expect(endOfJakartaDay('2026-10-06').toISOString()).toBe('2026-10-06T17:00:00.000Z');
    expect(endOfJakartaDay('2026-12-31').toISOString()).toBe('2026-12-31T17:00:00.000Z');
  });
});
