import type { Readable } from 'node:stream';

/**
 * Tempat menyimpan berkas bukti. Kode lain hanya mengenal kelas ini, jadi penyimpanan bisa
 * diganti (mis. ke S3) tanpa mengubah pemakainya. Kunci adalah nama datar yang dibuat
 * aplikasi sendiri, tidak pernah berasal dari nama berkas milik user.
 */
export abstract class StorageService {
  /** Menyimpan objek baru; gagal bila kuncinya sudah ada. */
  abstract save(key: string, content: Buffer): Promise<void>;

  /** Membuka objek untuk dibaca; gagal bila tidak ada. */
  abstract open(key: string): Promise<Readable>;

  /** Menghapus objek; tidak gagal bila sudah tidak ada. */
  abstract delete(key: string): Promise<void>;
}
