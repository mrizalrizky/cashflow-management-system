/** Uang disimpan sebagai bigint dan dikirim sebagai string di JSON. */
export function installBigIntJson(): void {
  (BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function (this: bigint) {
    return this.toString();
  };
}
