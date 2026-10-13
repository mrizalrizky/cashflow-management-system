import { expect, test } from '@playwright/test'
import { ownerApi } from './api'
import { choose, horizontalOverflow, openFromMenu, signIn } from './helpers'

const ACCOUNT = 'Kas Wishlist'
const CATEGORY = 'Belanja Wishlist'
const ITEM = 'Kamera Uji'

test('a wishlist item: answered, reviewed without a key, then bought and recorded', async ({ page, request }) => {
  test.setTimeout(120_000)

  await signIn(page)
  const api = await ownerApi(request)
  await api.post('/accounts', { name: ACCOUNT, type: 'CASH', openingBalance: '20000000' })
  await api.post('/categories', { name: CATEGORY, type: 'OUT' })

  await test.step('the owner adds an item with the six answers', async () => {
    await openFromMenu(page, 'Wishlist')
    await page.getByTestId('add-wish').click()
    const dialog = page.getByRole('dialog', { name: 'Tambah barang' })
    await dialog.getByLabel('Nama barang').fill(ITEM)
    await dialog.getByLabel('Harga (Rp)').fill('7.500.000')
    await dialog.getByLabel('Kenapa saya menginginkannya?').fill('Kamera ponsel kurang untuk acara keluarga')
    await dialog.getByLabel('Apakah saya sudah punya yang mirip?').fill('Hanya kamera ponsel')
    await dialog.getByLabel('Bagaimana barang ini menambah nilai dalam hidup saya?').fill('Dokumentasi keluarga')
    await dialog.getByLabel('Berapa lama saya membutuhkannya, dan untuk apa?').fill('Bertahun-tahun, tiap acara')
    await dialog.getByRole('button', { name: 'Simpan' }).click()
    await expect(dialog).toBeHidden()

    const row = page.getByTestId(/^wish-/).filter({ hasText: ITEM })
    await expect(row).toContainText('Menunggu')
    await expect(row).toContainText('Belum dinilai')
  })

  await test.step('asking the AI without a key on the server says so, and the page fits a phone', async () => {
    await page.getByRole('link', { name: ITEM }).click()
    await page.getByTestId('ask-ai').click()
    await expect(page.getByTestId('review-card')).toContainText('Penilaian AI belum diaktifkan di server.')

    await page.setViewportSize({ width: 360, height: 740 })
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
    await page.setViewportSize({ width: 1280, height: 720 })
  })

  await test.step('"Dibeli" offers to record the expense, filled with the price and the name', async () => {
    await page.getByTestId('mark-bought').click()
    await page.getByTestId('shortcut-expense').click()

    const form = page.getByRole('dialog', { name: 'Catat transaksi' })
    await expect(form.getByLabel('Jumlah (Rp)')).toHaveValue('7.500.000')
    await expect(form.getByLabel('Keterangan')).toHaveValue(ITEM)
    await choose(page, form, 'Akun', ACCOUNT)
    await choose(page, form, 'Kategori', CATEGORY)
    await form.getByRole('button', { name: 'Simpan' }).click()
    await expect(form).toBeHidden()

    await openFromMenu(page, 'Transaksi')
    await expect(page.getByRole('row').filter({ hasText: ITEM })).toContainText('-Rp 7.500.000')
  })

  await test.step('the item now shows under Dibeli', async () => {
    await openFromMenu(page, 'Wishlist')
    await page.getByRole('combobox', { name: 'Status' }).click()
    await page.getByRole('option', { name: 'Dibeli', exact: true }).click()
    await expect(page.getByTestId(/^wish-/).filter({ hasText: ITEM })).toContainText('Dibeli')
  })
})
