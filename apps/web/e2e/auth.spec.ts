import { expect, test, type Page } from '@playwright/test'
import { ADMIN } from './env'

const STAFF = {
  name: 'Siti Lapangan',
  email: 'siti@example.com',
  temporaryPassword: 'sementara-siti-1',
  password: 'password-siti-1',
}

async function login(page: Page, email: string, password: string): Promise<void> {
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Masuk' }).click()
}

async function changePassword(page: Page, current: string, next: string): Promise<void> {
  await page.getByLabel('Password saat ini').fill(current)
  await page.getByLabel('Password baru', { exact: true }).fill(next)
  await page.getByLabel('Ulangi password baru').fill(next)
  await page.getByRole('button', { name: 'Simpan password' }).click()
}

function sidebarLinks(page: Page) {
  return page.getByTestId('sidebar').getByRole('link')
}

test('login, forced password change, user management and role limits', async ({ page }) => {
  await test.step('a protected page sends a visitor to login', async () => {
    await page.goto('/pengguna')
    await expect(page).toHaveURL(/\/login\?redirect=\/pengguna$/)
  })

  await test.step('the seeded admin must change the temporary password first', async () => {
    await login(page, ADMIN.email, ADMIN.temporaryPassword)
    await expect(page).toHaveURL(/\/ganti-password$/)
    await expect(page.getByText('wajib mengganti password')).toBeVisible()

    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/ganti-password$/)
  })

  await test.step('after the change the admin lands on the dashboard with the full menu', async () => {
    await changePassword(page, ADMIN.temporaryPassword, ADMIN.password)
    await expect(page).toHaveURL(/\/dashboard$/)
    await expect(sidebarLinks(page)).toHaveText(['Dashboard', 'Transaksi', 'Proyek', 'Master data', 'Pengguna'])
    await expect(page.getByRole('banner')).toContainText(ADMIN.name)
  })

  await test.step('a reload keeps the session and the page', async () => {
    await page.reload()
    await expect(page).toHaveURL(/\/dashboard$/)
    await expect(sidebarLinks(page)).toHaveCount(5)
    await expect(page.getByRole('button', { name: 'Masuk' })).toHaveCount(0)
  })

  await test.step('the admin creates a staff user', async () => {
    await sidebarLinks(page).filter({ hasText: 'Pengguna' }).click()
    await expect(page.getByRole('heading', { name: 'Pengguna' })).toBeVisible()
    await page.getByRole('button', { name: 'Tambah pengguna' }).click()

    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Nama').fill(STAFF.name)
    await dialog.getByLabel('Email').fill(STAFF.email)
    await dialog.getByRole('combobox', { name: 'Peran' }).click()
    await page.getByRole('option', { name: 'Staf' }).click()
    await dialog.getByLabel('Password sementara').fill(STAFF.temporaryPassword)
    await dialog.getByRole('button', { name: 'Simpan' }).click()

    await expect(dialog).toBeHidden()
    const row = page.getByRole('row').filter({ hasText: STAFF.email })
    await expect(row).toContainText(STAFF.name)
    await expect(row).toContainText('Staf')
    await expect(row).toContainText('Aktif')
  })

  await test.step('logging out closes the app, even through the Back button', async () => {
    await page.getByRole('button', { name: 'Keluar' }).click()
    await expect(page).toHaveURL(/\/login$/)

    await page.goBack()
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByTestId('sidebar')).toHaveCount(0)
  })

  await test.step('the staff user is confined to their own pages', async () => {
    await page.goto('/login')
    await login(page, STAFF.email, STAFF.temporaryPassword)
    await expect(page).toHaveURL(/\/ganti-password$/)
    await changePassword(page, STAFF.temporaryPassword, STAFF.password)

    await expect(page).toHaveURL(/\/transaksi$/)
    await expect(sidebarLinks(page)).toHaveText(['Transaksi'])

    await page.goto('/pengguna')
    await expect(page).toHaveURL(/\/transaksi$/)
  })

  await test.step('on a phone the page does not scroll sideways and the menu is a drawer', async () => {
    await page.setViewportSize({ width: 360, height: 740 })
    await expect(page.getByTestId('sidebar')).toBeHidden()

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)

    await page.getByRole('button', { name: 'Buka menu' }).click()
    await expect(page.getByTestId('drawer-nav').getByRole('link', { name: 'Transaksi' })).toBeVisible()
  })
})
