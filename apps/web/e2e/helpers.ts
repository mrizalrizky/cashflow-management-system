import { expect, type Locator, type Page } from '@playwright/test'

export interface TestAccount {
  email: string
  /** Password yang diberikan admin atau seed; wajib diganti saat login pertama. */
  temporaryPassword: string
  /** Password setelah diganti. */
  password: string
}

export async function login(page: Page, email: string, password: string): Promise<void> {
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Masuk' }).click()
}

export async function changePassword(page: Page, current: string, next: string): Promise<void> {
  await page.getByLabel('Password saat ini').fill(current)
  await page.getByLabel('Password baru', { exact: true }).fill(next)
  await page.getByLabel('Ulangi password baru').fill(next)
  await page.getByRole('button', { name: 'Simpan password' }).click()
}

/**
 * Masuk sebagai sebuah akun, apa pun keadaannya: bila password-nya masih yang sementara,
 * diganti dulu. Dengan begitu tiap file test tidak bergantung pada file lain yang jalan lebih dulu.
 */
export async function signIn(page: Page, account: TestAccount): Promise<void> {
  await page.goto('/login')
  await login(page, account.email, account.password)

  const outcome = await Promise.race([
    page.waitForURL((url) => !url.pathname.startsWith('/login')).then(() => 'in' as const),
    page
      .getByRole('alert')
      .first()
      .waitFor()
      .then(() => 'refused' as const),
  ])
  if (outcome === 'in') return

  await login(page, account.email, account.temporaryPassword)
  await expect(page).toHaveURL(/\/ganti-password$/)
  await changePassword(page, account.temporaryPassword, account.password)
  await page.waitForURL((url) => !url.pathname.startsWith('/ganti-password'))
}

export async function logout(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Keluar' }).click()
  await expect(page).toHaveURL(/\/login$/)
}

export function sidebarLinks(page: Page): Locator {
  return page.getByTestId('sidebar').getByRole('link')
}

export async function openFromMenu(page: Page, label: string): Promise<void> {
  await sidebarLinks(page).filter({ hasText: label }).click()
}

/** Memilih satu pilihan pada dropdown berlabel di dalam sebuah dialog. */
export async function choose(page: Page, scope: Locator, label: string, option: string): Promise<void> {
  await scope.getByRole('combobox', { name: label }).click()
  await page.getByRole('option', { name: option, exact: true }).click()
  // Daftar pilihan menutup dengan animasi; ditunggu supaya tidak tertukar dengan dropdown berikutnya.
  await expect(page.getByRole('listbox')).toHaveCount(0)
}

/** Selisih lebar isi halaman terhadap lebar layar; lebih dari 0 berarti halaman bisa digulir ke samping. */
export function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
}
