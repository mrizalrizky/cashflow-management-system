import { randomUUID } from 'node:crypto'
import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test'
import { ownerApi } from './api'
import { choose, horizontalOverflow, openFromMenu, signIn } from './helpers'

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

/** Menyiapkan akun dan kategori lewat API. */
async function prepare(request: APIRequestContext): Promise<void> {
  const api = await ownerApi(request)
  await api.post('/accounts', { name: CASH, type: 'CASH', openingBalance: '1000000' })
  await api.post('/accounts', { name: BANK, type: 'BANK', openingBalance: '0' })
  await api.post('/categories', { name: CATEGORY, type: 'OUT' })
}

function row(page: Page, description: string): Locator {
  return page.getByRole('row').filter({ hasText: description })
}

async function recordExpense(page: Page, expense: { amount: string; description: string }): Promise<void> {
  await page.getByRole('button', { name: 'Catat transaksi' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Jumlah (Rp)').fill(expense.amount)
  await choose(page, dialog, 'Akun', CASH)
  await choose(page, dialog, 'Kategori', CATEGORY)
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

async function balanceRow(page: Page): Promise<Locator> {
  await openFromMenu(page, 'Master data')
  return row(page, CASH)
}

test('recording, correcting, voiding and transferring', async ({ page, request }) => {
  test.setTimeout(180_000)

  await signIn(page)
  await prepare(request)

  await test.step('the owner records two expenses with proof', async () => {
    await openFromMenu(page, 'Transaksi')
    await expect(page.getByRole('heading', { name: 'Transaksi' })).toBeVisible()

    await recordExpense(page, { amount: '150.000', description: 'Beli semen uji' })
    await expect(row(page, 'Beli semen uji')).toContainText('Tercatat')
    await expect(row(page, 'Beli semen uji')).toContainText('-Rp 150.000')

    await recordExpense(page, { amount: '900.000', description: 'Beli besi uji' })
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

  await test.step('the detail page shows the proof', async () => {
    await openTransaction(page, 'Beli semen uji')
    await page.getByRole('button', { name: `Lihat ${PROOF.name}` }).click()
    const image = page.getByRole('img', { name: PROOF.name })
    await expect(image).toBeVisible()
    expect(await image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
    await page.keyboard.press('Escape')
    await expect(image).toBeHidden()
  })

  await test.step('a recorded expense can be corrected', async () => {
    await openTransaction(page, 'Beli besi uji')
    await page.getByRole('button', { name: 'Ubah' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Jumlah (Rp)').fill('90.000')
    await dialog.getByRole('button', { name: 'Simpan' }).click()
    await expect(dialog).toBeHidden()

    await expect(page.getByTestId('tx-amount')).toHaveText('-Rp 90.000')
    await expect(page.getByText('Tercatat', { exact: true })).toBeVisible()
  })

  await test.step('the detail page fits a phone screen, and unknown transactions are not found', async () => {
    await page.setViewportSize(PHONE)
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
    await page.setViewportSize(DESKTOP)

    await page.goto(`/transaksi/${randomUUID()}`)
    await expect(page.getByText('Transaksi tidak ditemukan')).toBeVisible()
  })

  await test.step('the balance is reduced by exactly what was recorded', async () => {
    const account = await balanceRow(page)
    await expect(account).toContainText('Rp 1.000.000')
    await expect(account).toContainText('Rp 760.000')
  })

  await test.step('voiding an expense returns its amount and freezes it', async () => {
    await openTransaction(page, 'Beli semen uji')
    await page.getByRole('button', { name: 'Void' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Alasan void').fill('Nota ganda')
    await dialog.getByRole('button', { name: 'Void', exact: true }).click()
    await expect(dialog).toBeHidden()

    await expect(page.getByText('Dibatalkan', { exact: true })).toBeVisible()
    await expect(page.getByTestId('tx-void-reason')).toHaveText('Nota ganda')
    await expect(page.getByRole('button', { name: 'Ubah' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: `Hapus ${PROOF.name}` })).toHaveCount(0)

    const account = await balanceRow(page)
    await expect(account).toContainText('Rp 910.000')
  })

  await test.step('money moves between accounts, which shows as two transfer rows', async () => {
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
    await expect(account).toContainText('Rp 710.000')
  })
})
