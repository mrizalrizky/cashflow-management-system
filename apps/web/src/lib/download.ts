/** Menawarkan sebuah berkas yang sudah ada di memori sebagai unduhan dengan nama tertentu. */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  // Dilepas setelah browser sempat memulai unduhannya.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
