import { assertTestDatabaseUrl, DEFAULT_TEST_DATABASE_URL } from './test-env.js';

describe('assertTestDatabaseUrl', () => {
  it('accepts a database whose name ends in _test', () => {
    expect(assertTestDatabaseUrl(DEFAULT_TEST_DATABASE_URL)).toBe(DEFAULT_TEST_DATABASE_URL);
  });

  it('accepts a _test database with query parameters', () => {
    const url = `${DEFAULT_TEST_DATABASE_URL}?schema=public`;
    expect(assertTestDatabaseUrl(url)).toBe(url);
  });

  it('refuses the dev database', () => {
    expect(() =>
      assertTestDatabaseUrl('postgresql://cashflow:cashflow_dev@localhost:5432/cashflow'),
    ).toThrow(/_test/);
  });

  it('refuses a missing url', () => {
    expect(() => assertTestDatabaseUrl(undefined)).toThrow(/DATABASE_URL/);
  });
});
