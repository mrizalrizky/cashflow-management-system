import { randomUUID } from 'node:crypto'
import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test'
import { ADMIN } from './env'
import { choose, horizontalOverflow, logout, openFromMenu, signIn, type TestAccount } from './helpers'

const STAFF: TestAccount & { name: string } = {
  name: 'Staf Transaksi',
  email: 'staf.transaksi@example.com',
  temporaryPassword: 'sementara-staf-1',
  password: 'password-staf-1',
}
const COORDINATOR: TestAccount & { name: string } = {
  name: 'Koordinator Transaksi',
  email: 'koordinator.transaksi@example.com',
  temporaryPassword: 'sementara-koor-2',
  password: 'password-koor-2',
}
const CASH = 'Kas Transaksi'
const BANK = 'Bank Transaksi'
const CATEGORY = 'Bahan Transaksi'
const PHONE = { width: 360, height: 740 }
const DESKTOP = { width: 1280, height: 720 }
/** Gambar PNG 1x1 yang sah, supaya pratinjaunya benar-benar tampil. */
const PROOF = {
  name: 'nota.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  ),
}

/** Menyiapkan akun, kategori, proyek dan pengguna lewat API, atas nama admin. */
async function prepare(request: APIRequestContext): Promise<{ projectLabel: string }> {
  const login = await request.post('/api/v1/auth/login', {
    data: { email: ADMIN.email, password: ADMIN.password },
  })
  expect(login.ok()).toBe(true)
  const headers = { Authorization: `Bearer ${(await login.json()).accessToken}` }

  async function post<T>(path: string, data: unknown): Promise<T> {
    const response = await request.post(`/api/v1${path}`, { headers, data })
    expect(response.ok(), `${path}: ${await response.text()}`).toBe(true)
    return response.json() as Promise<T>
  }

  await post('/accounts', { name: CASH, type: 'CASH', openingBalance: '1000000' })
  await post('/accounts', { name: BANK, type: 'BANK', openingBalance: '0' })
  await post('/categories', { name: CATEGORY, type: 'OUT' })
  await post('/users', { name: STAFF.name, email: STAFF.email, role: 'STAFF', password: STAFF.temporaryPassword })
  const coordinator = await post<{ id: string }>('/users', {
    name: COORDINATOR.name,
    email: COORDINATOR.email,
    role: 'PROJECT_MANAGER',
    password: COORDINATOR.temporaryPassword,
  })
  const project = await post<{ id: string; code: string; name: string }>('/projects', {
    name: 'Gudang Uji',
    clientName: 'Klien Transaksi',
  })
  const members = await request.put(`/api/v1/projects/${project.id}/members`, {
    headers,
    data: { userIds: [coordinator.id] },
  })
  expect(members.ok()).toBe(true)
  return { projectLabel: `${project.code} · ${project.name}` }
}

function row(page: Page, description: string): Locator {
  return page.getByRole('row').filter({ hasText: description })
}

async function recordExpense(
  page: Page,
  projectLabel: string,
  expense: { amount: string; description: string },
): Promise<void> {
  await page.getByRole('button', { name: 'Catat transaksi' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Jumlah (Rp)').fill(expense.amount)
  await choose(page, dialog, 'Akun', CASH)
  await choose(page, dialog, 'Kategori', CATEGORY)
  await choose(page, dialog, 'Proyek', projectLabel)
  await dialog.getByLabel('Keterangan').fill(expense.description)
  await dialog.locator('input[type="file"]').setInputFiles(PROOF)
  await expect(dialog.getByText(PROOF.name)).toBeVisible()
  await dialog.getByRole('button', { name: 'Simpan' }).click()
  await expect(dialog).toBeHidden()
}

async function openTransaction(page: Page, description: string): Promise<void> {
  await openFromMenu(page, 'Transaksi')
  await page.getByRole('link', { name: description }).click()
  await expect(page.getByRole('heading', { name: description })).toBeVisible()
}

/** Mengisi alasan pada dialog tindakan lalu menegaskannya. */
async function giveReason(page: Page, label: string, reason: string, confirm: string): Promise<void> {
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel(label).fill(reason)
  await dialog.getByRole('button', { name: confirm, exact: true }).click()
  await expect(dialog).toBeHidden()
}

async function balanceRow(page: Page): Promise<Locator> {
  await openFromMenu(page, 'Master data')
  return row(page, CASH)
}

test('recording, reviewing, correcting, voiding and transferring', async ({ page, request }) => {
  test.setTimeout(180_000)

  // Admin dipastikan sudah memakai password tetapnya sebelum data disiapkan lewat API.
  await signIn(page, ADMIN)
  const { projectLabel } = await prepare(request)
  await logout(page)

  await test.step('a staff user records two expenses with proof', async () => {
    await signIn(page, STAFF)
    await expect(page).toHaveURL(/\/transaksi$/)
    await expect(page.getByRole('heading', { name: 'Transaksi Saya' })).toBeVisible()

    await recordExpense(page, projectLabel, { amount: '150.000', description: 'Beli semen uji' })
    await expect(row(page, 'Beli semen uji')).toContainText('Menunggu')
    await expect(row(page, 'Beli semen uji')).toContainText('-Rp 150.000')

    await recordExpense(page, projectLabel, { amount: '900.000', description: 'Beli besi uji' })
    await expect(row(page, 'Beli besi uji')).toContainText('-Rp 900.000')
  })

  await test.step('the list and the form fit a phone screen', async () => {
    await page.setViewportSize(PHONE)
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)

    await page.getByRole('button', { name: 'Catat transaksi' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
    await page.getByRole('dialog').getByRole('button', { name: 'Batal' }).click()
    await page.setViewportSize(DESKTOP)
  })

  await logout(page)

  await test.step('the project manager sees the proof and approves the first', async () => {
    await signIn(page, COORDINATOR)
    await openFromMenu(page, 'Transaksi')
    await expect(row(page, 'Beli semen uji')).toContainText('Perlu ditinjau')

    await openTransaction(page, 'Beli semen uji')
    await page.getByRole('button', { name: `Lihat ${PROOF.name}` }).click()
    const image = page.getByRole('img', { name: PROOF.name })
    await expect(image).toBeVisible()
    expect(await image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
    await page.keyboard.press('Escape')
    await expect(image).toBeHidden()

    await page.getByRole('button', { name: 'Setujui' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Setujui' }).click()
    await expect(page.getByText('Transaksi disetujui')).toBeVisible()
    await expect(page.getByText('Disetujui', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Setujui' })).toHaveCount(0)
  })

  await test.step('and rejects the second with a reason', async () => {
    await openTransaction(page, 'Beli besi uji')
    await page.getByRole('button', { name: 'Tolak' }).click()
    await giveReason(page, 'Alasan penolakan', 'Nominal tidak sesuai nota', 'Tolak')

    await expect(page.getByText('Ditolak', { exact: true })).toBeVisible()
    await expect(page.getByTestId('tx-reject-reason')).toHaveText('Nominal tidak sesuai nota')
  })

  await test.step('the detail page fits a phone screen, and unknown transactions are not found', async () => {
    await page.setViewportSize(PHONE)
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
    await page.setViewportSize(DESKTOP)

    await page.goto(`/transaksi/${randomUUID()}`)
    await expect(page.getByText('Transaksi tidak ditemukan')).toBeVisible()
    await openFromMenu(page, 'Transaksi')
  })

  await logout(page)

  await test.step('the staff user can no longer change the approved expense', async () => {
    await signIn(page, STAFF)
    await openTransaction(page, 'Beli semen uji')
    await expect(page.getByText('Disetujui', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Ubah' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Batalkan' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: `Hapus ${PROOF.name}` })).toHaveCount(0)
  })

  await test.step('but fixes and resubmits the rejected one', async () => {
    await openTransaction(page, 'Beli besi uji')
    await expect(page.getByTestId('tx-reject-reason')).toHaveText('Nominal tidak sesuai nota')

    await page.getByRole('button', { name: 'Perbaiki dan ajukan lagi' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('Nominal tidak sesuai nota')
    await dialog.getByLabel('Jumlah (Rp)').fill('90.000')
    await dialog.getByRole('button', { name: 'Ajukan lagi' }).click()
    await expect(dialog).toBeHidden()

    await expect(page.getByText('Transaksi diajukan lagi')).toBeVisible()
    await expect(page.getByText('Menunggu', { exact: true })).toBeVisible()
    await expect(page.getByTestId('tx-amount')).toHaveText('-Rp 90.000')
  })

  await logout(page)

  await test.step('the admin sees the balance reduced by exactly the approved amount', async () => {
    await signIn(page, ADMIN)
    const account = await balanceRow(page)
    await expect(account).toContainText('Rp 1.000.000')
    await expect(account).toContainText('Rp 850.000')
  })

  await test.step('voids the approved expense, and the balance returns', async () => {
    await openTransaction(page, 'Beli semen uji')
    await page.getByRole('button', { name: 'Void' }).click()
    await giveReason(page, 'Alasan void', 'Nota ganda', 'Void')
    await expect(page.getByText('Dibatalkan', { exact: true })).toBeVisible()
    await expect(page.getByTestId('tx-void-reason')).toHaveText('Nota ganda')

    const account = await balanceRow(page)
    await expect(account.getByText('Rp 1.000.000')).toHaveCount(2)
  })

  await test.step('and moves money between accounts, which shows as two transfer rows', async () => {
    await openFromMenu(page, 'Transaksi')
    await page.getByRole('button', { name: 'Transfer antar akun' }).click()
    const dialog = page.getByRole('dialog')
    await choose(page, dialog, 'Akun asal', CASH)
    await choose(page, dialog, 'Akun tujuan', BANK)
    await dialog.getByLabel('Jumlah (Rp)').fill('200.000')
    await dialog.getByLabel('Keterangan').fill('Pindah kas uji')
    await dialog.getByRole('button', { name: 'Transfer', exact: true }).click()
    await expect(dialog).toBeHidden()

    const legs = row(page, 'Pindah kas uji')
    await expect(legs).toHaveCount(2)
    await expect(legs.first()).toContainText('Transfer')

    await page.locator('.p-toggleswitch').click()
    await expect(legs).toHaveCount(0)
    await expect(row(page, 'Beli besi uji')).toBeVisible()

    const account = await balanceRow(page)
    await expect(account).toContainText('Rp 800.000')
  })
})
