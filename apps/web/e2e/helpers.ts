import { expect, type Locator, type Page } from '@playwright/test'
import { OWNER } from './env'

/** Mengisi PIN lalu menekan tombolnya, pada halaman "Masuk". */
export async function enterPin(page: Page, pin: string): Promise<void> {
  await page.getByLabel('PIN', { exact: true }).fill(pin)
  await page.getByRole('button', { name: 'Masuk' }).click()
}

/** Masuk dengan PIN; pada database baru, PIN dibuat dulu. */
export async function signIn(page: Page, pin: string = OWNER.pin): Promise<void> {
  // Halaman "Masuk" sendiri pindah ke "Buat PIN" bila PIN belum ada; jawabannya yang menentukan.
  const status = page.waitForResponse((response) => response.url().endsWith('/auth/pin-status'))
  await page.goto('/masuk')
  const { pinSet } = (await (await status).json()) as { pinSet: boolean }
  if (!pinSet) {
    await expect(page).toHaveURL(/\/buat-pin$/)
    await page.getByLabel('PIN', { exact: true }).fill(pin)
    await page.getByLabel('Ulangi PIN').fill(pin)
    await page.getByRole('button', { name: 'Simpan PIN' }).click()
  } else {
    await enterPin(page, pin)
  }
  await page.waitForURL((url) => !PIN_PAGES.test(url.pathname))
}

const PIN_PAGES = /\/(masuk|buat-pin)$/

export async function logout(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Keluar' }).click()
  await expect(page).toHaveURL(/\/masuk$/)
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

/**
 * Elemen yang menjulur melewati tepi kanan layar dan tidak berada di dalam wadah yang
 * menggulir atau memotong isinya; untuk menjelaskan penyebab saat halaman melebar. Elemen
 * berposisi tetap (mis. wadah toast) tidak melebarkan halaman, jadi dilewati.
 */
export function overflowingElements(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const clipped = (el: Element): boolean => {
      for (let node: Element | null = el; node; node = node.parentElement) {
        const style = getComputedStyle(node)
        if (style.position === 'fixed') return true
        if (node !== el && node !== document.documentElement && style.overflowX !== 'visible') return true
      }
      return false
    }
    return [...document.querySelectorAll('body *')]
      .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1 && !clipped(el))
      .slice(0, 8)
      .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 80)} [${Math.round(el.getBoundingClientRect().right)}px]`)
  })
}
