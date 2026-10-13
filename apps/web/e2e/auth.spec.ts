import { expect, test, type Page } from '@playwright/test'
import { OWNER } from './env'
import { enterPin, horizontalOverflow, logout, openFromMenu, sidebarLinks, signIn } from './helpers'

// Nama berkas ini sengaja urut paling awal: ia mengharapkan database baru yang belum punya PIN.

async function changePin(page: Page, current: string, next: string): Promise<void> {
  await openFromMenu(page, 'Pengaturan')
  await page.getByLabel('PIN saat ini').fill(current)
  await page.getByLabel('PIN baru', { exact: true }).fill(next)
  await page.getByLabel('Ulangi PIN baru').fill(next)
  await page.getByRole('button', { name: 'Simpan PIN' }).click()
  await expect(page.getByText('PIN diganti. Perangkat lain sudah dikeluarkan.')).toBeVisible()
}

test('creating the PIN, signing in with it, and changing it', async ({ page }) => {
  await test.step('a protected page sends a visitor to the PIN entry', async () => {
    await page.goto('/transaksi')
    await expect(page).toHaveURL(/\/(masuk\?redirect=\/transaksi|buat-pin)$/)
  })

  await test.step('on the first visit the owner creates a PIN and lands on the dashboard', async () => {
    await page.goto('/masuk')
    await expect(page).toHaveURL(/\/buat-pin$/)
    await expect(page.getByRole('heading', { name: 'Buat PIN' })).toBeVisible()

    await page.getByLabel('PIN', { exact: true }).fill(OWNER.pin)
    await page.getByLabel('Ulangi PIN').fill(OWNER.pin)
    await page.getByRole('button', { name: 'Simpan PIN' }).click()

    await expect(page).toHaveURL(/\/dashboard$/)
    await expect(sidebarLinks(page)).toHaveText(['Dashboard', 'Transaksi', 'Cicilan', 'Master data', 'Pengaturan'])
  })

  await test.step('a reload keeps the session and the page', async () => {
    await page.reload()
    await expect(page).toHaveURL(/\/dashboard$/)
    await expect(sidebarLinks(page)).toHaveCount(5)
  })

  await test.step('logging out closes the app, even through the Back button', async () => {
    await logout(page)
    await page.goBack()
    await expect(page.getByTestId('sidebar')).toHaveCount(0)
  })

  await test.step('"Buat PIN" is not offered again', async () => {
    await page.goto('/buat-pin')
    await expect(page).toHaveURL(/\/masuk$/)
    await expect(page.getByText('PIN sudah dibuat. Masuk dengan PIN itu.')).toBeVisible()
  })

  await test.step('a wrong PIN is refused; the right one opens the dashboard', async () => {
    await page.goto('/masuk')
    await enterPin(page, '999999')
    await expect(page.getByText('PIN salah')).toBeVisible()
    await expect(page).toHaveURL(/\/masuk$/)

    await enterPin(page, OWNER.pin)
    await expect(page).toHaveURL(/\/dashboard$/)
  })

  await test.step('the owner changes the PIN in Pengaturan; the old one stops working', async () => {
    await changePin(page, OWNER.pin, OWNER.newPin)
    await logout(page)

    await enterPin(page, OWNER.pin)
    await expect(page.getByText('PIN salah')).toBeVisible()
    await enterPin(page, OWNER.newPin)
    await expect(page).toHaveURL(/\/dashboard$/)
  })

  await test.step('and changes it back, so the other files can sign in', async () => {
    await changePin(page, OWNER.newPin, OWNER.pin)
    await logout(page)
    await signIn(page)
    await expect(page).toHaveURL(/\/dashboard$/)
  })

  await test.step('on a phone the page does not scroll sideways and the menu is a drawer', async () => {
    await page.setViewportSize({ width: 360, height: 740 })
    await expect(page.getByTestId('sidebar')).toBeHidden()
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)

    await page.getByRole('button', { name: 'Buka menu' }).click()
    await expect(page.getByTestId('drawer-nav').getByRole('link', { name: 'Pengaturan' })).toBeVisible()
  })
})
