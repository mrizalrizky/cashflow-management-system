import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { ADMIN } from './env'
import { choose, horizontalOverflow, logout, openFromMenu, signIn, type TestAccount } from './helpers'

const COORDINATOR: TestAccount & { name: string } = {
  name: 'Koordinator Uji',
  email: 'koordinator@example.com',
  temporaryPassword: 'sementara-koor-1',
  password: 'password-koor-1',
}
const PHONE = { width: 360, height: 740 }

test('master data, projects and what a project manager can see', async ({ page }) => {
  await signIn(page, ADMIN)

  await test.step('the admin adds an account, typing the amount with separators', async () => {
    await openFromMenu(page, 'Master data')
    await page.getByRole('button', { name: 'Tambah akun' }).click()

    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Nama').fill('Kas Proyek')
    await choose(page, dialog, 'Jenis', 'Kas')
    await dialog.getByLabel('Saldo awal (Rp)').fill('1.500.000')
    await dialog.getByRole('button', { name: 'Simpan' }).click()

    await expect(dialog).toBeHidden()
    const row = page.getByRole('row').filter({ hasText: 'Kas Proyek' })
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

  await test.step('the admin creates a project manager', async () => {
    await openFromMenu(page, 'Pengguna')
    await page.getByRole('button', { name: 'Tambah pengguna' }).click()

    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Nama').fill(COORDINATOR.name)
    await dialog.getByLabel('Email').fill(COORDINATOR.email)
    await choose(page, dialog, 'Peran', 'Koordinator Proyek')
    await dialog.getByLabel('Password sementara').fill(COORDINATOR.temporaryPassword)
    await dialog.getByRole('button', { name: 'Simpan' }).click()

    await expect(dialog).toBeHidden()
    await expect(page.getByRole('row').filter({ hasText: COORDINATOR.email })).toBeVisible()
  })

  await test.step('and a project, which gets a code', async () => {
    await openFromMenu(page, 'Proyek')
    await page.getByRole('button', { name: 'Tambah proyek' }).click()

    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Nama proyek').fill('Rumah Uji')
    await dialog.getByLabel('Nama klien').fill('Klien Uji')
    await dialog.getByLabel('Nilai kontrak (Rp)').fill('850000000')
    await dialog.getByLabel('Nilai kontrak + PPN (Rp)').fill('943500000')
    await dialog.getByRole('button', { name: 'Simpan' }).click()

    await expect(dialog).toBeHidden()
    const row = page.getByRole('row').filter({ hasText: 'Rumah Uji' })
    await expect(row).toContainText(/PRJ-\d{4}-\d{3}/)
    await expect(row).toContainText('Rp 850.000.000')
    await expect(row).toContainText('Rp 943.500.000')
  })

  await test.step('then assigns the project manager to it', async () => {
    await page.getByRole('link', { name: /Rumah Uji/ }).click()
    await expect(page.getByRole('heading', { name: /Rumah Uji/ })).toBeVisible()

    await page.getByRole('tab', { name: 'Anggota' }).click()

    // Kotak isian aslinya tersembunyi di balik tampilan chip, jadi yang diklik adalah wadahnya.
    await expect(page.getByRole('combobox', { name: 'Koordinator proyek' })).toBeAttached()
    await page.locator('.p-multiselect').click()
    await page.getByRole('option', { name: COORDINATOR.name }).click()
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Simpan koordinator' }).click()

    await expect(page.getByText('Koordinator proyek disimpan')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Simpan koordinator' })).toBeDisabled()
  })

  await logout(page)

  await test.step('the project manager sees only that project and cannot change it', async () => {
    await signIn(page, COORDINATOR)
    await expect(page).toHaveURL(/\/proyek$/)
    await expect(page.getByRole('heading', { name: 'Proyek Saya' })).toBeVisible()
    await expect(page.getByRole('link', { name: /Rumah Uji/ })).toHaveCount(1)
    await expect(page.locator('tbody tr')).toHaveCount(1)
    await expect(page.getByRole('button', { name: 'Tambah proyek' })).toHaveCount(0)

    await page.getByRole('link', { name: /Rumah Uji/ }).click()
    await expect(page.getByRole('heading', { name: /Rumah Uji/ })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Ubah proyek' })).toHaveCount(0)
    await page.getByRole('tab', { name: 'Anggota' }).click()
    await expect(page.getByTestId('member')).toHaveText([new RegExp(COORDINATOR.email)])
    await expect(page.getByRole('button', { name: 'Simpan koordinator' })).toHaveCount(0)
  })

  await test.step('and is turned away from pages and projects that are not theirs', async () => {
    await page.goto('/master-data')
    await expect(page).toHaveURL(/\/proyek$/)

    await page.goto(`/proyek/${randomUUID()}`)
    await expect(page.getByText('Proyek tidak ditemukan')).toBeVisible()
  })

  await test.step('the project list fits a phone screen', async () => {
    await page.setViewportSize(PHONE)
    await page.goto('/proyek')
    await expect(page.getByRole('link', { name: /Rumah Uji/ })).toBeVisible()
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
  })
})
