export interface FileType {
  mimeType: string;
  /** Tanpa titik. */
  extension: string;
}

interface Signature extends FileType {
  matches: (content: Buffer) => boolean;
}

function startsWith(content: Buffer, bytes: number[], offset = 0): boolean {
  return content.length >= offset + bytes.length && bytes.every((byte, i) => content[offset + i] === byte);
}

function ascii(text: string): number[] {
  return [...Buffer.from(text, 'ascii')];
}

// Hanya jenis yang diizinkan sebagai bukti transaksi.
const SIGNATURES: Signature[] = [
  {
    mimeType: 'image/jpeg',
    extension: 'jpg',
    matches: (content) => startsWith(content, [0xff, 0xd8, 0xff]),
  },
  {
    mimeType: 'image/png',
    extension: 'png',
    matches: (content) => startsWith(content, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  },
  {
    mimeType: 'image/webp',
    extension: 'webp',
    // Wadah RIFF dipakai banyak format; yang WebP punya "WEBP" setelah 4 byte ukuran.
    matches: (content) => startsWith(content, ascii('RIFF')) && startsWith(content, ascii('WEBP'), 8),
  },
  {
    mimeType: 'application/pdf',
    extension: 'pdf',
    matches: (content) => startsWith(content, ascii('%PDF-')),
  },
];

/**
 * Mengenali jenis berkas dari isinya. Nama berkas dan tipe yang dikirim klien tidak dipercaya,
 * karena keduanya bisa dipalsukan. Mengembalikan null untuk jenis yang tidak diizinkan.
 */
export function sniffFileType(content: Buffer): FileType | null {
  const found = SIGNATURES.find((signature) => signature.matches(content));
  return found ? { mimeType: found.mimeType, extension: found.extension } : null;
}
