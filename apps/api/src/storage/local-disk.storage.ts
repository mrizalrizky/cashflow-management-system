import { createReadStream } from 'node:fs';
import { access, mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Readable } from 'node:stream';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageService } from './storage.service.js';

// Huruf, angka, titik, garis: tanpa pemisah folder, jadi kunci tidak bisa keluar dari folder akar.
const SAFE_KEY = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Menyimpan berkas di satu folder pada disk (volume Docker di produksi). */
@Injectable()
export class LocalDiskStorage extends StorageService {
  private readonly root: string;

  constructor(config: ConfigService) {
    super();
    this.root = resolve(config.getOrThrow<string>('STORAGE_DIR'));
  }

  async save(key: string, content: Buffer): Promise<void> {
    const path = this.pathFor(key);
    await mkdir(this.root, { recursive: true });
    // `wx`: gagal bila berkas sudah ada, supaya tidak pernah menimpa bukti lain.
    await writeFile(path, content, { flag: 'wx' });
  }

  async open(key: string): Promise<Readable> {
    const path = this.pathFor(key);
    await access(path);
    return createReadStream(path);
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }

  private pathFor(key: string): string {
    if (!SAFE_KEY.test(key) || key.includes('..')) {
      throw new Error('Kunci penyimpanan tidak sah');
    }
    return join(this.root, key);
  }
}
