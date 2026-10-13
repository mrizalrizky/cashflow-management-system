import { readFile } from 'node:fs/promises'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { ownerApi } from './api'
import { choose, horizontalOverflow, openFromMenu, overflowingElements, signIn } from './helpers'

const PHONE = { width: 360, height: 740 }
const DESKTOP = { width: 1280, height: 720 }
const PROOF = { name: 'nota.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF\n') }
const BOM = [0xef, 0xbb, 0xbf]

/**
 * Tiga pengeluaran lewat API: yang pertama berbukti, yang kedua dibatalkan, dan yang ketiga
 * keterangannya menyerupai rumus.
 */
async function prepare(request: APIRequestContext): Promise<void> {
  const api = await ownerApi(request)
  const id = async (path: string, data: unknown) => (await api.post<{ id: string }>(path, data)).id

  const accountId = await id('/accounts', { name: 'Kas Audit', type: 'CASH', openingBalance: '1000000' })
  const categoryId = await id('/categories', { name: 'Bahan Audit', type: 'OUT' })
  const expense = (description: string) =>
    id('/transactions', {
      type: 'OUT',
      amount: '125000',
      transactionDate: '2026-10-01',
      description,
      accountId,
      categoryId,
    })

  const first = await expense('Audit satu')
  await api.upload(`/transactions/${first}/attachments`, PROOF)
  const second = await expense('Audit dua')
  await api.post(`/transactions/${second}/void`, { reason: 'Salah catat' })
  await expense('=1+1 uji Audit')
}

/** Mengeklik "Ekspor CSV" dan mengembalikan nama serta isi berkas yang terunduh. */
async function exportCsv(page: Page): Promise<{ name: string; bytes: Buffer; lines: string[] }> {
  const waiting = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Ekspor CSV' }).click()
  const download = await waiting
  const bytes = await readFile(await download.path())
  const lines = bytes.toString('utf8').replace(/^﻿/, '').split('\r\n').filter(Boolean)
  await expect(page.getByText('Berkas ekspor diunduh').last()).toBeVisible()
  return { name: download.suggestedFilename(), bytes, lines }
}

async function search(page: Page, text: string, rows: number): Promise<void> {
  await page.getByLabel('Cari keterangan').fill(text)
  // Ditunggu sampai daftar benar-benar tersaring: hanya baris yang cocok yang tersisa.
  await expect(page.locator('tbody tr')).toHaveCount(rows)
  await expect(page.locator('tbody tr').filter({ hasText: text })).toHaveCount(rows)
}

test('exporting what is on screen, and reading it back in the audit log', async ({ page, request }) => {
  test.setTimeout(150_000)

  await signIn(page)
  await prepare(request)

  await test.step('the owner exports what the filters show', async () => {
    await openFromMenu(page, 'Transaksi')
    await search(page, 'Audit', 3)

    await choose(page, page.locator('main'), 'Status', 'Dibatalkan')
    await expect(page.locator('tbody tr')).toHaveCount(1)
    const voided = await exportCsv(page)

    expect(voided.name).toMatch(/^transaksi-\d{8}-\d{4}\.csv$/)
    expect([...voided.bytes.subarray(0, 3)]).toEqual(BOM)
    expect(voided.lines[0]).toContain('Tanggal;Tipe;Jumlah;Keterangan')
    expect(voided.lines).toHaveLength(2)
    expect(voided.lines[1]).toContain('Audit dua')
    expect(voided.lines[1]).toContain('Dibatalkan')
  })

  await test.step('with formula-like text defused', async () => {
    await page.getByTestId('reset-filters').click()
    await search(page, 'Audit', 3)
    const all = await exportCsv(page)
    expect(all.lines).toHaveLength(4)
    expect(all.lines.some((line) => line.split(';')[3] === "'=1+1 uji Audit")).toBe(true)
  })

  await test.step('the audit log, under Pengaturan, shows those exports newest first and fits a phone', async () => {
    await openFromMenu(page, 'Pengaturan')
    await page.getByRole('link', { name: 'Buka log audit' }).click()
    await expect(page).toHaveURL(/\/pengaturan\/audit-log$/)
    await expect(page.getByRole('heading', { name: 'Audit log' })).toBeVisible()

    const rows = page.locator('tbody tr')
    await expect(rows.nth(0)).toContainText('Mengekspor')
    await expect(rows.nth(1)).toContainText('Mengekspor')

    await page.setViewportSize(PHONE)
    expect(await overflowingElements(page)).toEqual([])
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
    await page.setViewportSize(DESKTOP)
  })

  await test.step('the history of one transaction is its own entries only', async () => {
    await openFromMenu(page, 'Transaksi')
    await search(page, 'Audit dua', 1)
    await page.getByRole('link', { name: 'Audit dua' }).click()
    await page.getByRole('link', { name: 'Riwayat perubahan' }).click()

    await expect(page).toHaveURL(/\/pengaturan\/audit-log\?entityType=transaction&entityId=/)
    await expect(page.getByTestId('record-notice')).toContainText('Riwayat satu data: Transaksi')
    const rows = page.locator('tbody tr')
    await expect(rows).toHaveCount(2)
    await expect(rows.nth(0)).toContainText('Void')
    await expect(rows.nth(1)).toContainText('Membuat')

    await rows.nth(0).getByRole('button', { name: 'Lihat rincian' }).click()
    const status = page.getByRole('dialog').getByTestId('change-row').filter({ hasText: 'status' })
    await expect(status).toContainText('APPROVED')
    await expect(status).toContainText('VOID')
    await page.keyboard.press('Escape')
  })
})
