import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listAuditLogs } from '@/api/audit-logs'
import * as http from '@/api/http'
import { exportTransactions } from '@/api/transactions'
import { changedFields, describeValue } from '../audit'
import { formatDateTime } from '../format'
import { AUDIT_ACTION_OPTIONS, AUDIT_ENTITY_OPTIONS, auditActionLabel, auditEntityLabel } from '../labels'

vi.mock('@/api/http')

describe('audit and export API modules', () => {
  beforeEach(() => vi.resetAllMocks())

  it('lists audit entries with the given filters', async () => {
    vi.mocked(http.request).mockResolvedValue({ data: [] })

    await listAuditLogs({ page: 2, pageSize: 20, entityType: 'transaction', entityId: 't1', action: null })

    expect(http.request).toHaveBeenCalledExactlyOnceWith('/audit-logs', {
      query: { page: 2, pageSize: 20, entityType: 'transaction', entityId: 't1', action: null },
    })
  })

  it('asks for the export with the filters and nothing about pages', async () => {
    const file = { blob: new Blob(['x']), fileName: 'transaksi.csv' }
    vi.mocked(http.requestFile).mockResolvedValue(file)

    expect(await exportTransactions({ status: 'PENDING', includeTransfers: false })).toBe(file)

    expect(http.requestFile).toHaveBeenCalledExactlyOnceWith('/transactions/export', {
      status: 'PENDING',
      includeTransfers: false,
    })
  })
})

describe('formatDateTime', () => {
  it('shows the Jakarta date and time', () => {
    expect(formatDateTime('2026-10-06T03:05:00.000Z')).toBe('06 Okt 2026 10.05')
    expect(formatDateTime('2026-10-06T17:30:00.000Z')).toBe('07 Okt 2026 00.30')
  })

  it.each([undefined, null, '', 'bukan waktu'])('returns a dash for %j', (value) => {
    expect(formatDateTime(value)).toBe('-')
  })
})

describe('audit labels', () => {
  const ACTIONS = [
    'LOGIN',
    'LOGIN_FAILED',
    'LOGOUT',
    'TOKEN_REUSE',
    'CHANGE_PASSWORD',
    'RESET_PASSWORD',
    'CREATE',
    'UPDATE',
    'SET_MEMBERS',
    'RESUBMIT',
    'CANCEL',
    'APPROVE',
    'REJECT',
    'VOID',
    'TRANSFER',
    'ATTACH',
    'DETACH',
    'EXPORT',
  ]
  const ENTITIES = ['transaction', 'account', 'category', 'project', 'user']

  it('names every action the API writes, in Indonesian', () => {
    for (const action of ACTIONS) expect(auditActionLabel(action)).not.toBe(action)
    expect(auditActionLabel('APPROVE')).toBe('Menyetujui')
    expect(auditActionLabel('EXPORT')).toBe('Mengekspor')
    expect(AUDIT_ACTION_OPTIONS.map((option) => option.value).sort()).toEqual([...ACTIONS].sort())
  })

  it('names every record type', () => {
    for (const entity of ENTITIES) expect(auditEntityLabel(entity)).not.toBe(entity)
    expect(auditEntityLabel('transaction')).toBe('Transaksi')
    expect(AUDIT_ENTITY_OPTIONS.map((option) => option.value).sort()).toEqual([...ENTITIES].sort())
  })

  it('shows a value it does not know as it is', () => {
    expect(auditActionLabel('ARCHIVE')).toBe('ARCHIVE')
    expect(auditEntityLabel('invoice')).toBe('invoice')
  })

  it('does not mistake a built-in property name for a label', () => {
    expect(auditEntityLabel('constructor')).toBe('constructor')
    expect(auditActionLabel('toString')).toBe('toString')
  })
})

describe('describeValue', () => {
  it.each([
    [null, '-'],
    [undefined, '-'],
    [true, 'Ya'],
    [false, 'Tidak'],
    [42, '42'],
    ['Beli semen', 'Beli semen'],
    ['', '-'],
  ])('describes %j as %j', (value, text) => {
    expect(describeValue('description', value)).toBe(text)
  })

  it('keeps markup as plain text', () => {
    expect(describeValue('description', '<script>alert(1)</script>')).toBe('<script>alert(1)</script>')
  })

  it.each(['amount', 'opening_balance', 'contract_value', 'contract_value_with_ppn'])('shows %s as rupiah', (field) => {
    expect(describeValue(field, '1250000')).toBe('Rp 1.250.000')
    expect(describeValue(field, '9007199254740993')).toBe('Rp 9.007.199.254.740.993')
    expect(describeValue(field, 'bukan angka')).toBe('bukan angka')
  })

  it('does not treat other digit strings as money', () => {
    expect(describeValue('size_bytes', '2048')).toBe('2048')
  })

  it('shows nested values as compact JSON', () => {
    expect(describeValue('filters', { status: 'PENDING', rows: 3 })).toBe('{"status":"PENDING","rows":3}')
    expect(describeValue('removed_project_ids', ['p1', 'p2'])).toBe('["p1","p2"]')
  })

  it('shows a full-length reason or description whole, and cuts only absurdly long text', () => {
    // API mengizinkan 500 karakter; semuanya harus terbaca.
    expect(describeValue('reject_reason', 'x'.repeat(500))).toHaveLength(500)

    const text = describeValue('description', 'x'.repeat(5000))
    expect(text).toHaveLength(2001)
    expect(text.endsWith('…')).toBe(true)
  })

  it('shows timestamps in Jakarta time and calendar dates as dates', () => {
    expect(describeValue('updated_at', '2026-10-06T17:30:00.000Z')).toBe('07 Okt 2026 00.30')
    expect(describeValue('reviewed_at', '2026-10-06T03:05:00.000Z')).toBe('06 Okt 2026 10.05')
    expect(describeValue('start_date', '2026-10-01T00:00:00.000Z')).toBe('01 Okt 2026')
    expect(describeValue('transaction_date', '2026-10-01')).toBe('01 Okt 2026')
  })

  it('leaves a value alone when a date-like field does not hold a date', () => {
    expect(describeValue('updated_at', 'kemarin')).toBe('kemarin')
    expect(describeValue('start_date', 'segera')).toBe('segera')
    expect(describeValue('created_at', null)).toBe('-')
  })
})

describe('changedFields', () => {
  it('lists only the fields that differ, in alphabetical order', () => {
    const before = { status: 'PENDING', amount: '150000', description: 'Beli semen', reviewed_by_id: null }
    const after = { status: 'APPROVED', amount: '150000', description: 'Beli semen', reviewed_by_id: 'u1' }

    expect(changedFields(before, after)).toEqual([
      { field: 'reviewed_by_id', before: '-', after: 'u1' },
      { field: 'status', before: 'PENDING', after: 'APPROVED' },
    ])
  })

  it('lists every filled field of a new record', () => {
    expect(changedFields(null, { name: 'Kas Kecil', opening_balance: '500000', note: null })).toEqual([
      { field: 'name', before: '-', after: 'Kas Kecil' },
      { field: 'opening_balance', before: '-', after: 'Rp 500.000' },
    ])
  })

  it('lists every filled field of a removed record', () => {
    expect(changedFields({ file_name: 'nota.pdf', size_bytes: 2048 }, null)).toEqual([
      { field: 'file_name', before: 'nota.pdf', after: '-' },
      { field: 'size_bytes', before: '2048', after: '-' },
    ])
  })

  it('is empty when nothing differs or nothing was recorded', () => {
    expect(changedFields({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 })).toEqual([])
    expect(changedFields(null, null)).toEqual([])
    expect(changedFields(undefined, undefined)).toEqual([])
  })

  it('includes a field present on one side only', () => {
    expect(changedFields({ a: 1 }, { a: 1, updated_at: '2026-10-06T03:00:00.000Z' })).toEqual([
      { field: 'updated_at', before: '-', after: '06 Okt 2026 10.00' },
    ])
  })

  it('treats a snapshot that is not an object as one value', () => {
    expect(changedFields('lama', 'baru')).toEqual([{ field: 'nilai', before: 'lama', after: 'baru' }])
    expect(changedFields(null, ['a'])).toEqual([{ field: 'nilai', before: '-', after: '["a"]' }])
  })

  it('notices a change far into a long text', () => {
    const start = 'x'.repeat(350)

    const changes = changedFields({ description: `${start} lama` }, { description: `${start} baru` })

    expect(changes).toHaveLength(1)
    expect(changes[0]!.before.endsWith(' lama')).toBe(true)
    expect(changes[0]!.after.endsWith(' baru')).toBe(true)
  })

  it('notices a change at the end of a long list', () => {
    const ids = Array.from({ length: 12 }, (_unused, i) => `11111111-2222-4333-8444-${String(i).padStart(12, '0')}`)

    expect(changedFields({ user_ids: ids.slice(0, 11) }, { user_ids: ids })).toHaveLength(1)
  })

  it('treats empty, null and missing as the same absence', () => {
    expect(changedFields({ note: null, reason: '' }, { note: '', other: null })).toEqual([])
  })

  it('reads only the fields a snapshot really has', () => {
    expect(changedFields({ constructor: 'a' }, {})).toEqual([{ field: 'constructor', before: 'a', after: '-' }])
  })

  it('compares nested values by content', () => {
    expect(changedFields({ ids: ['a'] }, { ids: ['a', 'b'] })).toEqual([
      { field: 'ids', before: '["a"]', after: '["a","b"]' },
    ])
  })
})
