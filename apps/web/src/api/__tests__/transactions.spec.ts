import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as accounts from '../accounts'
import * as attachments from '../attachments'
import * as http from '../http'
import * as projects from '../projects'
import * as transactions from '../transactions'

vi.mock('../http')

const request = vi.mocked(http.request)
const requestBlob = vi.mocked(http.requestBlob)

const INPUT = {
  type: 'OUT',
  amount: '150000',
  transactionDate: '2026-10-01',
  description: 'Beli semen',
  accountId: 'a1',
  categoryId: 'c1',
  projectId: null,
} as const

const TRANSFER = {
  fromAccountId: 'a1',
  toAccountId: 'a2',
  amount: '500000',
  transactionDate: '2026-10-01',
  description: 'Isi kas kecil',
}

beforeEach(() => {
  vi.resetAllMocks()
  request.mockResolvedValue({ data: [] })
})

describe('transaction API modules', () => {
  it.each<[string, () => Promise<unknown>, Parameters<typeof http.request>]>([
    [
      'listTransactions',
      () => transactions.listTransactions({ page: 2, pageSize: 20, status: 'PENDING', projectId: null, overhead: true }),
      ['/transactions', { query: { page: 2, pageSize: 20, status: 'PENDING', projectId: null, overhead: true } }],
    ],
    ['getTransaction', () => transactions.getTransaction('t1'), ['/transactions/t1']],
    ['createTransaction', () => transactions.createTransaction(INPUT), ['/transactions', { method: 'POST', body: INPUT }]],
    [
      'updateTransaction',
      () => transactions.updateTransaction('t1', { amount: '90000' }),
      ['/transactions/t1', { method: 'PATCH', body: { amount: '90000' } }],
    ],
    [
      'cancelTransaction',
      () => transactions.cancelTransaction('t1', 'Salah input'),
      ['/transactions/t1/cancel', { method: 'POST', body: { reason: 'Salah input' } }],
    ],
    [
      'approveTransaction',
      () => transactions.approveTransaction('t1', '2026-10-01T03:00:00.000Z'),
      ['/transactions/t1/approve', { method: 'POST', body: { expectedUpdatedAt: '2026-10-01T03:00:00.000Z' } }],
    ],
    [
      'rejectTransaction',
      () => transactions.rejectTransaction('t1', 'Nota buram', '2026-10-01T03:00:00.000Z'),
      [
        '/transactions/t1/reject',
        { method: 'POST', body: { reason: 'Nota buram', expectedUpdatedAt: '2026-10-01T03:00:00.000Z' } },
      ],
    ],
    [
      'voidTransaction',
      () => transactions.voidTransaction('t1', 'Nota ganda'),
      ['/transactions/t1/void', { method: 'POST', body: { reason: 'Nota ganda' } }],
    ],
    [
      'createTransfer',
      () => transactions.createTransfer(TRANSFER),
      ['/transactions/transfer', { method: 'POST', body: TRANSFER }],
    ],
    ['removeAttachment', () => attachments.removeAttachment('f1'), ['/attachments/f1', { method: 'DELETE' }]],
    ['listAccountOptions', () => accounts.listAccountOptions(), ['/accounts/options']],
    ['listProjectOptions', () => projects.listProjectOptions(), ['/projects/options']],
  ])('%s calls the right route', async (_name, call, expected) => {
    await call()
    expect(request).toHaveBeenCalledExactlyOnceWith(...expected)
  })

  it('uploads a proof file as the "file" part of a form', async () => {
    const file = new File(['isi'], 'nota.jpg', { type: 'image/jpeg' })

    await attachments.uploadAttachment('t1', file)

    const [path, options] = request.mock.calls[0]!
    expect(path).toBe('/transactions/t1/attachments')
    expect(options?.method).toBe('POST')
    expect(options?.body).toBeUndefined()
    const sent = options?.form?.get('file') as File
    expect(sent.name).toBe('nota.jpg')
    expect(await sent.text()).toBe('isi')
  })

  it('downloads a proof file as a blob', async () => {
    const blob = new Blob(['isi'])
    requestBlob.mockResolvedValue(blob)

    expect(await attachments.downloadAttachment('f1')).toBe(blob)

    expect(requestBlob).toHaveBeenCalledExactlyOnceWith('/attachments/f1/download')
  })
})
