import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { ownerApi } from './api'
import { choose, horizontalOverflow, overflowingElements, signIn } from './helpers'

/**
 * Data file ini sengaja diletakkan pada Maret 2025, bulan yang tidak dipakai file test lain,
 * supaya angka periode itu hanya berasal dari sini:
 *
 *   05 Mar  IN   Gaji Dasbor   10.000.000
 *   10 Mar  OUT  Bahan Dasbor   4.000.000
 *   20 Mar  OUT  Jasa Dasbor    1.500.000
 *   25 Mar  OUT  Bahan Dasbor     700.000  dibatalkan (tidak dihitung)
 *
 * Maret 2025: masuk 10.000.000; keluar 4.000.000 + 1.500.000 = 5.500.000; selisih 4.500.000.
 * Saldo Bank Dasbor: 5.000.000 + 10.000.000 - 5.500.000 = 9.500.000.
 */
const ACCOUNT = 'Bank Dasbor'
const PHONE = { width: 360, height: 740 }
const DESKTOP = { width: 1280, height: 720 }

async function prepare(request: APIRequestContext): Promise<void> {
  const api = await ownerApi(request)
  const id = async (path: string, data: unknown) => (await api.post<{ id: string }>(path, data)).id

  const accountId = await id('/accounts', { name: ACCOUNT, type: 'BANK', openingBalance: '5000000' })
  const material = await id('/categories', { name: 'Bahan Dasbor', type: 'OUT' })
  const service = await id('/categories', { name: 'Jasa Dasbor', type: 'OUT' })
  const income = await id('/categories', { name: 'Gaji Dasbor', type: 'IN' })

  const record = (type: 'IN' | 'OUT', amount: string, day: string, categoryId: string) =>
    id('/transactions', {
      type,
      amount,
      transactionDate: `2025-03-${day}`,
      description: `Dasbor ${day} Maret`,
      accountId,
      categoryId,
    })

  await record('IN', '10000000', '05', income)
  await record('OUT', '4000000', '10', material)
  await record('OUT', '1500000', '20', service)
  const voided = await record('OUT', '700000', '25', material)
  await api.post(`/transactions/${voided}/void`, { reason: 'Tercatat dua kali' })
}

/** Mengetik tanggal pada kolom berlabel, seperti pengguna, lalu menutup kalendernya. */
async function typeDate(page: Page, label: string, value: string): Promise<void> {
  const field = page.getByLabel(label)
  await field.fill(value)
  await field.press('Enter')
  await page.keyboard.press('Escape')
  // Kalender menutup dengan animasi; ditunggu supaya tidak ikut terukur atau menutupi yang lain.
  await expect(page.locator('.p-datepicker-panel')).toHaveCount(0)
}

async function showPeriod(page: Page, from: string, to: string, covered: string): Promise<void> {
  await typeDate(page, 'Dari tanggal', from)
  await typeDate(page, 'Sampai tanggal', to)
  await expect(page.getByTestId('period-covered')).toHaveText(covered)
  await expect(page.getByTestId('figures')).toHaveAttribute('aria-busy', 'false')
}

/** Nominal rupiah pada sebuah kartu angka, sebagai bilangan bulat. */
async function statAmount(page: Page, testId: string): Promise<number> {
  const text = await page.getByTestId(testId).innerText()
  return Number(text.replace(/[^\d]/g, ''))
}

function rupiah(amount: number): string {
  return `Rp ${amount.toLocaleString('id-ID')}`
}

test('the dashboard shows the figures computed by hand, and records an expense', async ({ page, request }) => {
  test.setTimeout(120_000)

  await signIn(page)
  await prepare(request)

  await test.step('the owner lands on the dashboard, which covers the last twelve months', async () => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/dashboard$/)
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    await expect(page.getByTestId('preset-last12')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('account-row').filter({ hasText: ACCOUNT })).toContainText('Rp 9.500.000')
  })

  await test.step('a long period with figures fits a phone screen; only the chart scrolls', async () => {
    // Hanya tanggal awal yang diubah; tanggal akhir tetap hari ini, jadi periodenya lebih dari setahun.
    await typeDate(page, 'Dari tanggal', '01 Mar 2025')
    await expect(page.getByTestId('period-covered')).toContainText('01 Mar 2025 –')
    await expect(page.getByTestId('chart-scroll').getByRole('listitem').filter({ hasText: 'Mar 2025' })).toBeVisible()

    await page.setViewportSize(PHONE)
    expect(await overflowingElements(page)).toEqual([])
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
    const chart = page.getByTestId('chart-scroll')
    expect(await chart.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true)
    await page.setViewportSize(DESKTOP)
  })

  await test.step('for March 2025 the totals, the month and the categories match', async () => {
    await showPeriod(page, '01 Mar 2025', '31 Mar 2025', '01 Mar 2025 – 31 Mar 2025')

    await expect(page.getByTestId('stat-income')).toContainText('Rp 10.000.000')
    await expect(page.getByTestId('stat-expense')).toContainText('Rp 5.500.000')
    await expect(page.getByTestId('stat-net')).toContainText('Rp 4.500.000')
    const march = page.getByTestId('chart-scroll').getByRole('listitem').filter({ hasText: 'Mar 2025' })
    await expect(march.getByTestId('month-income')).toHaveText('masuk Rp 10.000.000')
    await expect(march.getByTestId('month-expense')).toHaveText('keluar Rp 5.500.000')
    await expect(march.getByTestId('month-net')).toHaveText('selisih +Rp 4.500.000')

    const categories = page.locator('section', { hasText: 'Pengeluaran per kategori' }).getByRole('listitem')
    await expect(categories).toHaveCount(2)
    await expect(categories.nth(0)).toContainText('Bahan Dasbor')
    await expect(categories.nth(0)).toContainText('Rp 4.000.000')
    await expect(categories.nth(1)).toContainText('Jasa Dasbor')
    await expect(categories.nth(1)).toContainText('Rp 1.500.000')
  })

  await test.step('a period with nothing in it shows zeros, not empty axes', async () => {
    await showPeriod(page, '01 Jan 2024', '31 Jan 2024', '01 Jan 2024 – 31 Jan 2024')

    await expect(page.getByTestId('stat-income')).toContainText('Rp 0')
    await expect(page.getByTestId('stat-net')).toContainText('Rp 0')
    await expect(page.getByText('Belum ada transaksi pada periode ini')).toBeVisible()
    await expect(page.getByText('Belum ada pengeluaran pada periode ini').first()).toBeVisible()
  })

  await test.step('"Bulan ini" switches the period', async () => {
    await page.getByTestId('preset-thisMonth').click()
    await expect(page.getByTestId('preset-thisMonth')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('period-covered')).not.toHaveText('01 Jan 2024 – 31 Jan 2024')
    await expect(page.getByTestId('figures')).toHaveAttribute('aria-busy', 'false')
  })

  await test.step('"Catat pengeluaran" records an expense and the figures follow', async () => {
    const before = await statAmount(page, 'stat-expense')

    await page.getByTestId('record-expense').click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Jumlah (Rp)').fill('50.000')
    await choose(page, dialog, 'Akun', ACCOUNT)
    await choose(page, dialog, 'Kategori', 'Jasa Dasbor')
    await dialog.getByLabel('Keterangan').fill('Parkir dari dasbor')
    await dialog.getByRole('button', { name: 'Simpan' }).click()
    await expect(dialog).toBeHidden()

    await expect(page.getByTestId('stat-expense')).toContainText(rupiah(before + 50_000))
    await expect(page.getByTestId('account-row').filter({ hasText: ACCOUNT })).toContainText('Rp 9.450.000')
  })
})
