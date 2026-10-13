import { expect, test } from '@playwright/test'
import { choose, horizontalOverflow, openFromMenu, signIn } from './helpers'

const PHONE = { width: 360, height: 740 }

test('adding accounts and categories', async ({ page }) => {
  await signIn(page)

  await test.step('the owner adds an account, typing the amount with separators', async () => {
    await openFromMenu(page, 'Master data')
    await page.getByRole('button', { name: 'Tambah akun' }).click()

    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Nama').fill('Kas Uji')
    await choose(page, dialog, 'Jenis', 'Kas')
    await dialog.getByLabel('Saldo awal (Rp)').fill('1.500.000')
    await dialog.getByRole('button', { name: 'Simpan' }).click()

    await expect(dialog).toBeHidden()
    const row = page.getByRole('row').filter({ hasText: 'Kas Uji' })
    await expect(row.getByText('Rp 1.500.000')).toHaveCount(2)
  })

  await test.step('and a category, which appears under its type', async () => {
    await page.getByRole('tab', { name: 'Kategori' }).click()
    await page.getByRole('button', { name: 'Tambah kategori' }).click()

    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Nama').fill('Biaya Uji')
    await choose(page, dialog, 'Tipe', 'Pengeluaran')
    await dialog.getByRole('button', { name: 'Simpan' }).click()

    await expect(dialog).toBeHidden()
    await expect(page.getByTestId('group-OUT')).toContainText('Biaya Uji')
  })

  await test.step('the master data page fits a phone screen', async () => {
    await page.setViewportSize(PHONE)
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
    await page.setViewportSize({ width: 1280, height: 720 })
  })
})
