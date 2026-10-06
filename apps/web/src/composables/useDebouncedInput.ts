import { onScopeDispose, ref, watch, type Ref } from 'vue'

/**
 * Teks yang diketik pengguna, diteruskan ke `apply` setelah ia berhenti mengetik sejenak.
 * Dipakai kotak pencarian supaya tidak memanggil API pada tiap ketukan.
 */
export function useDebouncedInput(apply: (value: string) => void, delayMs = 300): Ref<string> {
  const text = ref('')
  let timer: ReturnType<typeof setTimeout> | undefined

  watch(text, (value) => {
    clearTimeout(timer)
    timer = setTimeout(() => apply(value.trim()), delayMs)
  })
  onScopeDispose(() => clearTimeout(timer))

  return text
}
