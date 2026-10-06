import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/http'
import { useFormSubmit } from '../useFormSubmit'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

describe('useFormSubmit', () => {
  it('returns the value of the action and tracks the submitting state', async () => {
    const pending = deferred<string>()
    const form = useFormSubmit(() => pending.promise)

    const result = form.submit()
    expect(form.submitting.value).toBe(true)
    pending.resolve('tersimpan')

    expect(await result).toEqual({ ok: true, value: 'tersimpan' })
    expect(form.submitting.value).toBe(false)
  })

  it('shows client errors without calling the action', async () => {
    const action = vi.fn<() => Promise<void>>()
    const form = useFormSubmit(action)

    expect(await form.submit({ email: 'Email wajib diisi' })).toEqual({ ok: false })

    expect(action).not.toHaveBeenCalled()
    expect(form.fieldErrors.value).toEqual({ email: 'Email wajib diisi' })
  })

  it('maps field errors from the API to the first message per field', async () => {
    const form = useFormSubmit(() =>
      Promise.reject(
        new ApiError(400, 'Validasi gagal', [
          { field: 'email', messages: ['Format salah', 'Terlalu panjang'] },
          { field: 'name', messages: ['Wajib'] },
        ]),
      ),
    )

    expect(await form.submit()).toEqual({ ok: false })

    expect(form.fieldErrors.value).toEqual({ email: 'Format salah', name: 'Wajib' })
    expect(form.formError.value).toBeNull()
  })

  it('shows an API error without field errors as a form-level message', async () => {
    const form = useFormSubmit(() => Promise.reject(new ApiError(401, 'Email atau password salah')))

    await form.submit()

    expect(form.formError.value).toBe('Email atau password salah')
    expect(form.fieldErrors.value).toEqual({})
  })

  it('can attach a status code to a field', async () => {
    const form = useFormSubmit(() => Promise.reject(new ApiError(409, 'Email sudah dipakai')), {
      fieldForStatus: { 409: 'email' },
    })

    await form.submit()

    expect(form.fieldErrors.value).toEqual({ email: 'Email sudah dipakai' })
    expect(form.formError.value).toBeNull()
  })

  it('gives a generic message for an unexpected error', async () => {
    const form = useFormSubmit(() => Promise.reject(new Error('boom')))

    await form.submit()

    expect(form.formError.value).toBe('Terjadi kesalahan. Silakan coba lagi.')
  })

  it('ignores a second submit while the first is running', async () => {
    const pending = deferred<void>()
    const action = vi.fn<() => Promise<void>>(() => pending.promise)
    const form = useFormSubmit(action)

    const first = form.submit()
    expect(await form.submit()).toEqual({ ok: false })
    pending.resolve()
    await first

    expect(action).toHaveBeenCalledTimes(1)
  })

  it('clears earlier errors on the next attempt', async () => {
    const action = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new ApiError(401, 'Email atau password salah'))
      .mockResolvedValueOnce()
    const form = useFormSubmit(action)

    await form.submit()
    expect(form.formError.value).not.toBeNull()

    expect((await form.submit()).ok).toBe(true)
    expect(form.formError.value).toBeNull()
  })

  it('forgets every error when reset, for a form that is opened again', async () => {
    const form = useFormSubmit(() => Promise.reject(new ApiError(409, 'Email sudah dipakai')), {
      fieldForStatus: { 409: 'email' },
    })
    await form.submit()
    const other = useFormSubmit(() => Promise.reject(new ApiError(500, 'Gagal')))
    await other.submit()

    form.reset()
    other.reset()

    expect(form.fieldErrors.value).toEqual({})
    expect(other.formError.value).toBeNull()
  })
})
