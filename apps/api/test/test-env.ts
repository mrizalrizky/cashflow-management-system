export const DEFAULT_TEST_DATABASE_URL =
  'postgresql://cashflow:cashflow_dev@localhost:5432/cashflow_test';

/** e2e mengosongkan tabel, jadi hanya boleh jalan di database yang namanya diakhiri `_test`. */
export function assertTestDatabaseUrl(url: string | undefined): string {
  if (!url) {
    throw new Error('DATABASE_URL untuk e2e belum diisi');
  }
  const dbName = new URL(url).pathname.replace(/^\//, '');
  if (!dbName.endsWith('_test')) {
    throw new Error(`e2e menolak jalan di database "${dbName}": nama harus diakhiri _test`);
  }
  return url;
}
