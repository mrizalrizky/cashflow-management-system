import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { adminApi } from './api'
import { ADMIN } from './env'
import { horizontalOverflow, logout, overflowingElements, signIn, type TestAccount } from './helpers'

/**
 * Data file ini sengaja diletakkan pada Maret 2025, bulan yang tidak dipakai file test lain,
 * supaya angka periode itu hanya berasal dari sini:
 *
 *   05 Mar  IN   Termin Dasbor  10.000.000  Ruko Dasbor   disetujui
 *   10 Mar  OUT  Bahan Dasbor    4.000.000  Ruko Dasbor   disetujui
 *   20 Mar  OUT  Jasa Dasbor     1.500.000  overhead      disetujui
 *   25 Mar  OUT  Bahan Dasbor      700.000  Ruko Dasbor   menunggu (tidak dihitung)
 *
 * Maret 2025: masuk 10.000.000; keluar 4.000.000 + 1.500.000 = 5.500.000; selisih 4.500.000.
 * Overhead 1.500.000; proyek 4.000.000.
 * Saldo Bank Dasbor: 5.000.000 + 10.000.000 - 5.500.000 = 9.500.000.
 * Ruko Dasbor (kontrak 40.000.000): diterima 10.000.000 = 25%, sisa 30.000.000,
 *   biaya 4.000.000, selisih kas 6.000.000, satu transaksi menunggu.
 */
const COORDINATOR: TestAccount & { name: string } = {
  name: 'Koordinator Dasbor',
  email: 'koordinator.dasbor@example.com',
  temporaryPassword: 'sementara-koor-3',
  password: 'password-koor-3',
}
const ACCOUNT = 'Bank Dasbor'
const PHONE = { width: 360, height: 740 }
const DESKTOP = { width: 1280, height: 720 }
const PROOF = { name: 'nota.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF\n') }

async function prepare(request: APIRequestContext): Promise<void> {
  const api = await adminApi(request)
  const id = async (path: string, data: unknown) => (await api.post<{ id: string }>(path, data)).id

  const accountId = await id('/accounts', { name: ACCOUNT, type: 'BANK', openingBalance: '5000000' })
  const material = await id('/categories', { name: 'Bahan Dasbor', type: 'OUT' })
  const service = await id('/categories', { name: 'Jasa Dasbor', type: 'OUT' })
  const income = await id('/categories', { name: 'Termin Dasbor', type: 'IN' })
  const projectId = await id('/projects', {
    name: 'Ruko Dasbor',
    clientName: 'Klien Dasbor',
    contractValue: '40000000',
    contractValueWithPpn: '44400000',
  })
  const coordinatorId = await id('/users', {
    name: COORDINATOR.name,
    email: COORDINATOR.email,
    role: 'PROJECT_MANAGER',
    password: COORDINATOR.temporaryPassword,
  })
  await api.put(`/projects/${projectId}/members`, { userIds: [coordinatorId] })

  async function record(
    type: 'IN' | 'OUT',
    amount: string,
    day: string,
    categoryId: string,
    project: string | null,
    approve = true,
  ): Promise<void> {
    const transactionId = await id('/transactions', {
      type,
      amount,
      transactionDate: `2025-03-${day}`,
      description: `Dasbor ${day} Maret`,
      accountId,
      categoryId,
      projectId: project,
    })
    if (!approve) return
    // Pengeluaran wajib berbukti sebelum disetujui.
    if (type === 'OUT') await api.upload(`/transactions/${transactionId}/attachments`, PROOF)
    await api.post(`/transactions/${transactionId}/approve`)
  }

  await record('IN', '10000000', '05', income, projectId)
  await record('OUT', '4000000', '10', material, projectId)
  await record('OUT', '1500000', '20', service, null)
  await record('OUT', '700000', '25', material, projectId, false)
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

test('the dashboard and a project summary show the figures computed by hand', async ({ page, request }) => {
  test.setTimeout(120_000)

  await signIn(page, ADMIN)
  await prepare(request)

  await test.step('the admin lands on the dashboard, which covers the last twelve months', async () => {
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

    const scopes = page.locator('section', { hasText: 'Overhead dan proyek' }).getByRole('listitem')
    await expect(scopes.nth(0)).toContainText('Rp 1.500.000')
    await expect(scopes.nth(1)).toContainText('Rp 4.000.000')
  })

  await test.step('a period with nothing in it shows zeros, not empty axes', async () => {
    await showPeriod(page, '01 Jan 2024', '31 Jan 2024', '01 Jan 2024 – 31 Jan 2024')

    await expect(page.getByTestId('stat-income')).toContainText('Rp 0')
    await expect(page.getByTestId('stat-net')).toContainText('Rp 0')
    await expect(page.getByText('Belum ada transaksi yang disetujui pada periode ini')).toBeVisible()
    await expect(page.getByText('Belum ada pengeluaran pada periode ini').first()).toBeVisible()
  })

  await test.step('"Bulan ini" switches the period', async () => {
    await page.getByTestId('preset-thisMonth').click()
    await expect(page.getByTestId('preset-thisMonth')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('period-covered')).not.toHaveText('01 Jan 2024 – 31 Jan 2024')
  })

  await test.step('the waiting count opens the pending transactions', async () => {
    await page.getByTestId('pending-link').click()

    await expect(page).toHaveURL(/\/transaksi\?status=PENDING$/)
    await expect(page.getByRole('combobox', { name: 'Status' })).toHaveText('Menunggu')
    await expect(page.getByRole('row').filter({ hasText: 'Dasbor 25 Maret' })).toBeVisible()
    await expect(page.locator('tbody tr').filter({ hasText: 'Disetujui' })).toHaveCount(0)
  })

  await logout(page)

  await test.step('the project manager sees the summary of their project', async () => {
    await signIn(page, COORDINATOR)
    await page.getByRole('link', { name: /Ruko Dasbor/ }).click()
    await expect(page.getByRole('tab', { name: 'Ringkasan' })).toHaveAttribute('aria-selected', 'true')

    await expect(page.getByTestId('summary-contract')).toContainText('Rp 40.000.000')
    await expect(page.getByTestId('summary-contract-ppn')).toContainText('Rp 44.400.000')
    await expect(page.getByTestId('summary-received')).toContainText('Rp 10.000.000')
    await expect(page.getByTestId('summary-received')).toContainText('22,52% dari nilai kontrak + PPN')
    await expect(page.getByTestId('summary-outstanding')).toContainText('Rp 34.400.000')
    await expect(page.getByTestId('summary-cost')).toContainText('Rp 4.000.000')
    await expect(page.getByTestId('summary-difference')).toContainText('Rp 6.000.000')
    await expect(page.getByText('1 transaksi menunggu ditinjau')).toBeVisible()
  })

  await test.step('the summary fits a phone screen, and the dashboard is not theirs', async () => {
    await page.setViewportSize(PHONE)
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
    await page.setViewportSize(DESKTOP)

    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/proyek$/)
  })
})
