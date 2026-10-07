import { request, requestBlob } from './http'
import type { Attachment } from './types'

export function uploadAttachment(transactionId: string, file: File): Promise<Attachment> {
  const form = new FormData()
  form.append('file', file, file.name)
  return request(`/transactions/${transactionId}/attachments`, { method: 'POST', form })
}

/** Bukti hanya bisa diambil dengan access token, jadi tidak bisa dibuka lewat tautan biasa. */
export function downloadAttachment(id: string): Promise<Blob> {
  return requestBlob(`/attachments/${id}/download`)
}

export function removeAttachment(id: string): Promise<void> {
  return request(`/attachments/${id}`, { method: 'DELETE' })
}
