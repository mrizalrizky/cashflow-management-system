import { progressOf } from './installment-progress.js';

const PLAN = { startMonth: '2026-10', months: 3 };

describe('progressOf', () => {
  it('computes the end month from the start and the number of months', () => {
    expect(progressOf({ ...PLAN, paid: 0 }, '2026-10').endMonth).toBe('2026-12');
    expect(progressOf({ startMonth: '2026-11', months: 3, paid: 0 }, '2026-11').endMonth).toBe('2027-01');
    expect(progressOf({ startMonth: '2026-10', months: 1, paid: 0 }, '2026-10').endMonth).toBe('2026-10');
  });

  it('counts the months due from the start month to the current one, both included, capped', () => {
    expect(progressOf({ ...PLAN, paid: 0 }, '2026-09').due).toBe(0);
    expect(progressOf({ ...PLAN, paid: 0 }, '2026-10').due).toBe(1);
    expect(progressOf({ ...PLAN, paid: 0 }, '2026-12').due).toBe(3);
    expect(progressOf({ ...PLAN, paid: 0 }, '2027-06').due).toBe(3);
  });

  it('is not started before the start month, even when something was paid early', () => {
    expect(progressOf({ ...PLAN, paid: 0 }, '2026-09').status).toBe('NOT_STARTED');
    expect(progressOf({ ...PLAN, paid: 1 }, '2026-09').status).toBe('NOT_STARTED');
  });

  it('is paid off once every month is paid', () => {
    expect(progressOf({ ...PLAN, paid: 3 }, '2026-11').status).toBe('PAID_OFF');
    expect(progressOf({ ...PLAN, paid: 3 }, '2027-06').status).toBe('PAID_OFF');
  });

  it('is behind when fewer months are paid than are due, and says by how many', () => {
    const progress = progressOf({ ...PLAN, paid: 1 }, '2026-12');
    expect(progress).toMatchObject({ status: 'BEHIND', due: 3, paid: 1, behindMonths: 2 });
  });

  it('is on track when paid up to now, or ahead', () => {
    expect(progressOf({ ...PLAN, paid: 1 }, '2026-10')).toMatchObject({ status: 'ON_TRACK', behindMonths: 0 });
    expect(progressOf({ ...PLAN, paid: 2 }, '2026-10')).toMatchObject({ status: 'ON_TRACK', behindMonths: 0 });
  });

  it('covers the current month only between its start and end months', () => {
    expect(progressOf({ ...PLAN, paid: 0 }, '2026-09').coversMonth).toBe(false);
    expect(progressOf({ ...PLAN, paid: 0 }, '2026-10').coversMonth).toBe(true);
    expect(progressOf({ ...PLAN, paid: 0 }, '2026-12').coversMonth).toBe(true);
    expect(progressOf({ ...PLAN, paid: 0 }, '2027-01').coversMonth).toBe(false);
  });
});
