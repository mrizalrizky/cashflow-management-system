/** Email disimpan dan dibandingkan dalam huruf kecil tanpa spasi di tepi. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
