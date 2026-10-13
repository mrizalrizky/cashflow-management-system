import { Injectable } from '@nestjs/common';
import argon2 from 'argon2';

/** Hash argon2 untuk rahasia pengguna; di edisi pribadi, PIN pemilik. */
@Injectable()
export class PasswordService {
  private dummyHash?: Promise<string>;

  hash(plain: string): Promise<string> {
    return argon2.hash(plain);
  }

  /**
   * `hash` bernilai null bila belum ada. Verifikasi tetap dijalankan terhadap hash tiruan
   * supaya lama respons sama dalam semua keadaan.
   */
  async verify(hash: string | null, plain: string): Promise<boolean> {
    if (hash === null) {
      this.dummyHash ??= argon2.hash('dummy-pin');
      await argon2.verify(await this.dummyHash, plain);
      return false;
    }
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }
}
