import { expect, test } from '@playwright/test'
import { ownerApi } from './api'
import { choose, horizontalOverflow, openFromMenu, signIn } from './helpers'

const ACCOUNT = 'Kas Cicilan'
const CATEGORY = 'Kredit Uji'
const INSTALLMENT = 'Motor Uji'

test('an installment paid through an installment category', async ({ page, request }) => {
  test.setTimeout(120_000)

  await signIn(page)
  const api = await ownerApi(request)
  await api.post('/accounts', { name: ACCOUNT, type: 'CASH', openingBalance: '10000000' })
  await api.post('/categories', { name: CATEGORY, type: 'OUT', isInstallment: true })

  await test.step('the owner adds an installment and sees its end month', async () => {
    await openFromMenu(page, 'Cicilan')
    await expect(page.getByRole('heading', { name: 'Cicilan' })).toBeVisible()
    await page.getByTestId('add-installment').click()

    const dialog = page.getByRole('dialog', { name: 'Tambah cicilan' })
    await dialog.getByLabel('Nama').fill(INSTALLMENT)
    await dialog.getByLabel('Nominal per bulan (Rp)').fill('1.500.000')
    // Bulan pertama pada tahun yang ditampilkan pemilih bulan: Januari tahun ini.
    await dialog.getByLabel('Bulan mulai').click()
    await page.locator('.p-datepicker-month').first().click()
    // Panel bulan menutup dengan animasi; ditunggu supaya tidak tertukar dengan dialog form.
    await expect(page.locator('.p-datepicker-panel')).toHaveCount(0)
    await dialog.getByLabel('Jumlah bulan').fill('3')
    await expect(dialog.getByTestId('installment-end')).toContainText(/Mar \d{4}/)
    await dialog.getByRole('button', { name: 'Simpan' }).click()
    await expect(dialog).toBeHidden()

    await expect(page.getByRole('link', { name: INSTALLMENT })).toBeVisible()
  })

  await test.step('a payment recorded in Transaksi moves it to 1/3', async () => {
    await openFromMenu(page, 'Transaksi')
    await page.getByRole('button', { name: 'Catat transaksi' }).click()
    const dialog = page.getByRole('dialog')
    await choose(page, dialog, 'Akun', ACCOUNT)
    await choose(page, dialog, 'Kategori', CATEGORY)
    // Hanya satu cicilan yang belum lunas: langsung terpilih, dan nominalnya terisi.
    await expect(dialog.getByRole('combobox', { name: 'Cicilan yang dibayar' })).toContainText(INSTALLMENT)
    await expect(dialog.getByLabel('Jumlah (Rp)')).toHaveValue('1.500.000')
    await dialog.getByLabel('Keterangan').fill('Bayar motor uji')
    await dialog.getByRole('button', { name: 'Simpan' }).click()
    await expect(dialog).toBeHidden()

    await openFromMenu(page, 'Cicilan')
    const row = page.getByTestId(/^installment-/).filter({ hasText: INSTALLMENT })
    await expect(row.getByTestId('installment-progress')).toHaveText('1/3')
  })

  await test.step('the detail page lists the payment, and the page fits a phone', async () => {
    await page.getByRole('link', { name: INSTALLMENT }).click()
    await expect(page.getByRole('heading', { name: INSTALLMENT })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Bayar motor uji' })).toBeVisible()

    await page.setViewportSize({ width: 360, height: 740 })
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
    // Di layar ponsel menu ada di laci.
    await page.getByRole('button', { name: 'Buka menu' }).click()
    await page.getByTestId('drawer-nav').getByRole('link', { name: 'Cicilan' }).click()
    await expect(page.getByTestId('stat-active-monthly')).toBeVisible()
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
  })
})
