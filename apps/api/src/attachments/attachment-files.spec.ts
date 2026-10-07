import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { LocalDiskStorage } from '../storage/local-disk.storage.js';
import { sanitizeFileName } from './file-name.js';
import { sniffFileType } from './file-sniffer.js';
import { SAMPLE_FILES } from './testing/sample-files.js';

async function read(stream: AsyncIterable<Buffer | string>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

describe('sniffFileType', () => {
  it.each([
    ['jpeg', 'image/jpeg', 'jpg'],
    ['png', 'image/png', 'png'],
    ['webp', 'image/webp', 'webp'],
    ['pdf', 'application/pdf', 'pdf'],
  ] as const)('recognises a %s file from its content', (sample, mimeType, extension) => {
    expect(sniffFileType(SAMPLE_FILES[sample])).toEqual({ mimeType, extension });
  });

  it.each([
    ['a Windows executable', SAMPLE_FILES.exe],
    ['a ZIP archive', Buffer.from('PK\u0003\u0004 arsip')],
    ['an HTML page', Buffer.from('<!doctype html><script>alert(1)</script>')],
    ['an SVG image', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')],
    ['a RIFF file that is not WebP', Buffer.from('RIFF\u0000\u0000\u0000\u0000WAVEfmt ')],
    ['an empty file', Buffer.alloc(0)],
    ['a file shorter than any signature', Buffer.from([0xff, 0xd8])],
  ])('refuses %s', (_label, content) => {
    expect(sniffFileType(content)).toBeNull();
  });
});

describe('sanitizeFileName', () => {
  it.each([
    ['nota toko.pdf', 'pdf', 'nota toko.pdf'],
    ['../../etc/passwd', 'pdf', 'passwd.pdf'],
    ['C:\\Users\\budi\\nota.pdf', 'pdf', 'nota.pdf'],
    ['nota.exe', 'pdf', 'nota.pdf'],
    ['foto.JPEG', 'jpg', 'foto.jpg'],
    ['kwitansi "asli"\r\n.png', 'png', 'kwitansi asli.png'],
    ['struk_01-final.v2.png', 'png', 'struk_01-final.v2.png'],
    ['', 'jpg', 'bukti.jpg'],
    ['....', 'pdf', 'bukti.pdf'],
    ['нота.pdf', 'pdf', 'bukti.pdf'],
  ])('turns %j into a safe name with the right extension', (original, extension, expected) => {
    expect(sanitizeFileName(original, extension)).toBe(expected);
  });

  it('keeps long names within 120 characters, extension included', () => {
    const name = sanitizeFileName(`${'a'.repeat(300)}.pdf`, 'pdf');
    expect(name).toHaveLength(120);
    expect(name.endsWith('.pdf')).toBe(true);
  });
});

describe('LocalDiskStorage', () => {
  let root: string;
  let storage: LocalDiskStorage;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'cashflow-storage-'));
    // Folder di dalamnya belum ada: penyimpanan harus membuatnya sendiri.
    storage = new LocalDiskStorage({ getOrThrow: () => join(root, 'bukti') } as unknown as ConfigService);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('returns exactly the bytes that were saved', async () => {
    await storage.save('a1.pdf', SAMPLE_FILES.pdf);
    expect(await read(await storage.open('a1.pdf'))).toEqual(SAMPLE_FILES.pdf);
  });

  it('never overwrites an existing object', async () => {
    await storage.save('a1.pdf', SAMPLE_FILES.pdf);
    await expect(storage.save('a1.pdf', SAMPLE_FILES.png)).rejects.toThrow();
    expect(await read(await storage.open('a1.pdf'))).toEqual(SAMPLE_FILES.pdf);
  });

  it('removes an object, and does not mind when it is already gone', async () => {
    await storage.save('a1.pdf', SAMPLE_FILES.pdf);

    await storage.delete('a1.pdf');
    await storage.delete('a1.pdf');

    await expect(storage.open('a1.pdf')).rejects.toThrow();
    expect(await readdir(join(root, 'bukti'))).toEqual([]);
  });

  it.each(['../rahasia.pdf', 'a/b.pdf', 'a\\b.pdf', '..', '', 'nota pdf'])(
    'refuses the key %j for every operation',
    async (key) => {
      await expect(storage.save(key, SAMPLE_FILES.pdf)).rejects.toThrow('Kunci penyimpanan tidak sah');
      await expect(storage.open(key)).rejects.toThrow('Kunci penyimpanan tidak sah');
      await expect(storage.delete(key)).rejects.toThrow('Kunci penyimpanan tidak sah');
    },
  );
});
