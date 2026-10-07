import { readFile } from 'node:fs/promises'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { adminApi, apiAs } from './api'
import { ADMIN } from './env'
import {
  choose,
  horizontalOverflow,
  logout,
  openFromMenu,
  overflowingElements,
  sidebarLinks,
  signIn,
  type TestAccount,
} from './helpers'

// Nama berkas ini sengaja urut sesudah auth.spec.ts, yang mengharapkan admin masih memakai
// password sementaranya saat ia berjalan.

const STAFF: TestAccount & { name: string } = {
  name: 'Staf Audit',
  email: 'staf.audit@example.com',
  temporaryPassword: 'sementara-staf-4',
  password: 'password-staf-4',
}
const COORDINATOR: TestAccount & { name: string } = {
  name: 'Koordinator Audit',
  email: 'koordinator.audit@example.com',
  temporaryPassword: 'sementara-koor-4',
  password: 'password-koor-4',
}
const PHONE = { width: 360, height: 740 }
const DESKTOP = { width: 1280, height: 720 }
const PROOF = { name: 'nota.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF\n') }
const BOM = [0xef, 0xbb, 0xbf]

interface Prepared {
  accountId: string
  categoryId: string
  projectId: string
}

/** Akun, kategori, proyek dan dua pengguna, disiapkan lewat API atas nama admin. */
async function prepare(request: APIRequestContext): Promise<Prepared> {
  const api = await adminApi(request)
  const id = async (path: string, data: unknown) => (await api.post<{ id: string }>(path, data)).id

  const accountId = await id('/accounts', { name: 'Kas Audit', type: 'CASH', openingBalance: '1000000' })
  const categoryId = await id('/categories', { name: 'Bahan Audit', type: 'OUT' })
  const projectId = await id('/projects', { name: 'Kios Audit', clientName: 'Klien Audit' })
  await id('/users', { name: STAFF.name, email: STAFF.email, role: 'STAFF', password: STAFF.temporaryPassword })
  const coordinatorId = await id('/users', {
    name: COORDINATOR.name,
    email: COORDINATOR.email,
    role: 'PROJECT_MANAGER',
    password: COORDINATOR.temporaryPassword,
  })
  await api.put(`/projects/${projectId}/members`, { userIds: [coordinatorId] })
  return { accountId, categoryId, projectId }
}

/**
 * Staf mencatat dua pengeluaran proyek (yang pertama berbukti dan disetujui admin), dan admin
 * mencatat satu pengeluaran overhead yang keterangannya menyerupai rumus.
 */
async function recordTransactions(request: APIRequestContext, data: Prepared): Promise<void> {
  const staff = await apiAs(request, STAFF)
  const admin = await adminApi(request)
  const expense = (description: string, projectId: string | null) => ({
    type: 'OUT',
    amount: '125000',
    transactionDate: '2026-10-01',
    description,
    accountId: data.accountId,
    categoryId: data.categoryId,
    projectId,
  })

  const first = await staff.post<{ id: string }>('/transactions', expense('Audit satu', data.projectId))
  await staff.post('/transactions', expense('Audit dua', data.projectId))
  await staff.upload(`/transactions/${first.id}/attachments`, PROOF)
  await admin.post(`/transactions/${first.id}/approve`)
  await admin.post('/transactions', expense('=1+1 uji Audit', null))
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

  await signIn(page, ADMIN)
  const data = await prepare(request)
  await logout(page)

  await test.step('a staff user exports exactly their own transactions', async () => {
    await signIn(page, STAFF)
    await recordTransactions(request, data)
    await page.reload()
    await expect(page.locator('tbody tr')).toHaveCount(2)

    const file = await exportCsv(page)

    expect(file.name).toMatch(/^transaksi-\d{8}-\d{4}\.csv$/)
    expect([...file.bytes.subarray(0, 3)]).toEqual(BOM)
    expect(file.lines[0]).toContain('Tanggal;Tipe;Jumlah;Keterangan')
    expect(file.lines).toHaveLength(3)
    expect(file.lines.slice(1).map((line) => line.split(';')[3]).sort()).toEqual(['Audit dua', 'Audit satu'])
  })

  await logout(page)

  await test.step('the admin exports what the filters show, with formula-like text defused', async () => {
    await signIn(page, ADMIN)
    await openFromMenu(page, 'Transaksi')
    await search(page, 'Audit', 3)

    await choose(page, page.locator('main'), 'Status', 'Disetujui')
    await expect(page.locator('tbody tr')).toHaveCount(1)
    const approved = await exportCsv(page)
    expect(approved.lines).toHaveLength(2)
    expect(approved.lines[1]).toContain('Audit satu')
    expect(approved.lines[1]).toContain('Disetujui')

    await page.getByTestId('reset-filters').click()
    await search(page, 'Audit', 3)
    const all = await exportCsv(page)
    expect(all.lines).toHaveLength(4)
    expect(all.lines.some((line) => line.split(';')[3] === "'=1+1 uji Audit")).toBe(true)
  })

  await test.step('the audit log shows those exports, newest first, and fits a phone', async () => {
    await openFromMenu(page, 'Audit log')
    await expect(page.getByRole('heading', { name: 'Audit log' })).toBeVisible()

    const rows = page.locator('tbody tr')
    await expect(rows.nth(0)).toContainText('Mengekspor')
    await expect(rows.nth(0)).toContainText(ADMIN.name)
    await expect(rows.nth(1)).toContainText('Mengekspor')
    await expect(rows.filter({ hasText: 'Mengekspor' }).filter({ hasText: STAFF.name })).toHaveCount(1)

    await page.setViewportSize(PHONE)
    expect(await overflowingElements(page)).toEqual([])
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
    await page.setViewportSize(DESKTOP)
  })

  await test.step('the history of one transaction is its own entries only', async () => {
    await openFromMenu(page, 'Transaksi')
    await search(page, 'Audit satu', 1)
    await page.getByRole('link', { name: 'Audit satu' }).click()
    await page.getByRole('link', { name: 'Riwayat perubahan' }).click()

    await expect(page).toHaveURL(/\/audit-log\?entityType=transaction&entityId=/)
    await expect(page.getByTestId('record-notice')).toContainText('Riwayat satu data: Transaksi')
    const rows = page.locator('tbody tr')
    await expect(rows).toHaveCount(3)
    await expect(rows.nth(0)).toContainText('Menyetujui')
    await expect(rows.nth(1)).toContainText('Menambah bukti')
    await expect(rows.nth(2)).toContainText('Membuat')

    await rows.nth(0).getByRole('button', { name: 'Lihat rincian' }).click()
    const status = page.getByRole('dialog').getByTestId('change-row').filter({ hasText: 'status' })
    await expect(status).toContainText('PENDING')
    await expect(status).toContainText('APPROVED')
    await page.keyboard.press('Escape')
  })

  await logout(page)

  await test.step('a project manager has no audit log', async () => {
    await signIn(page, COORDINATOR)
    await expect(sidebarLinks(page).filter({ hasText: 'Audit log' })).toHaveCount(0)

    await page.goto('/audit-log')
    await expect(page).toHaveURL(/\/proyek$/)
  })
})
