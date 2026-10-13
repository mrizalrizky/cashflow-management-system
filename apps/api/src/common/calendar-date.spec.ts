import 'reflect-metadata';
import {
  addMonths,
  currentMonthInJakarta,
  currentYearInJakarta,
  formatCalendarMonth,
  isCalendarMonth,
  monthsBetween,
  parseCalendarMonth,
  IsCalendarDate,
  formatCalendarDate,
  formatJakartaTimestamp,
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

describe('formatJakartaTimestamp', () => {
  it('writes the Jakarta wall-clock time, crossing midnight and the year when needed', () => {
    expect(formatJakartaTimestamp(new Date('2026-10-06T03:05:00.000Z'))).toBe('2026-10-06 10:05');
    expect(formatJakartaTimestamp(new Date('2026-10-06T17:30:00.000Z'))).toBe('2026-10-07 00:30');
    expect(formatJakartaTimestamp(new Date('2026-12-31T17:00:00.000Z'))).toBe('2027-01-01 00:00');
  });
});

describe('months', () => {
  it('reads the current month on the Jakarta calendar, switching at Jakarta midnight', () => {
    expect(currentMonthInJakarta(new Date('2026-10-31T16:30:00.000Z'))).toBe('2026-10'); // 23:30 WIB
    expect(currentMonthInJakarta(new Date('2026-10-31T17:30:00.000Z'))).toBe('2026-11'); // 00:30 WIB
    expect(currentMonthInJakarta(new Date('2026-12-31T17:00:00.000Z'))).toBe('2027-01');
  });

  it('accepts only real months as YYYY-MM', () => {
    for (const ok of ['2026-01', '2026-12', '1900-01', '2999-12']) expect(isCalendarMonth(ok)).toBe(true);
    for (const bad of ['2026-13', '2026-00', '2026-1', '2026-10-01', '1899-12', '', 202610, null]) {
      expect(isCalendarMonth(bad)).toBe(false);
    }
  });

  it('stores a month as its first day and reads it back', () => {
    expect(parseCalendarMonth('2026-02').toISOString()).toBe('2026-02-01T00:00:00.000Z');
    expect(formatCalendarMonth(new Date('2026-02-01T00:00:00.000Z'))).toBe('2026-02');
  });

  it('adds months across years and counts the months between two months', () => {
    expect(addMonths('2026-11', 2)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(monthsBetween('2026-11', '2027-02')).toBe(3);
    expect(monthsBetween('2027-02', '2026-11')).toBe(-3);
  });
});
