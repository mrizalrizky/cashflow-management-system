<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import InputText from 'primevue/inputtext'
import { formatAmount, parseMoneyInput, parsePastedMoney } from '@/lib/money'

/** Kotak isian nominal rupiah. Nilainya string digit (`''` bila kosong), tampilannya berpemisah ribuan. */
const props = defineProps<{
  id: string
  invalid?: boolean
  /** Mengizinkan nilai minus, mis. saldo awal rekening yang sedang minus. */
  allowNegative?: boolean
  ariaDescribedby?: string
}>()

const model = defineModel<string>({ required: true })

const SIGNIFICANT = /[\d-]/

function display(value: string): string {
  return value === '' ? '' : formatAmount(value)
}

const text = ref(display(model.value))
/** True setelah masukan terakhir ditolak, supaya orang tahu kenapa ketikannya tidak muncul. */
const refused = ref(false)

// Nilai diubah dari luar (mis. formulir diisi ulang).
watch(model, (value) => {
  if (text.value !== '-' || value !== '') text.value = display(value)
})

function countSignificant(value: string, end: number): number {
  return Array.from(value.slice(0, end)).filter((char) => SIGNIFICANT.test(char)).length
}

/** Posisi di `value` tepat setelah `count` digit pertama (pemisah ribuan tidak dihitung). */
function positionAfter(value: string, count: number): number {
  let seen = 0
  for (let index = 0; index < value.length; index += 1) {
    if (seen === count) return index
    if (SIGNIFICANT.test(value[index]!)) seen += 1
  }
  return value.length
}

/**
 * Menampilkan `next` dan mengembalikan kursor ke digit yang sama. Tanpa ini, tiap kali
 * pemisah ribuan bergeser kursor melompat ke ujung dan ketukan berikutnya mengubah digit yang salah.
 */
async function show(input: HTMLInputElement, next: string, digitsBeforeCaret: number): Promise<void> {
  // Nilai ditulis dulu apa adanya supaya Vue melihat perubahan dan menimpa isi kotak.
  text.value = input.value
  await nextTick()
  text.value = next
  await nextTick()
  const caret = positionAfter(next, digitsBeforeCaret)
  input.setSelectionRange(caret, caret)
}

function accept(value: string): void {
  refused.value = false
  model.value = value
}

async function onInput(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const typed = input.value
  const digitsBeforeCaret = countSignificant(typed, input.selectionStart ?? typed.length)

  if (typed.trim() === '') {
    text.value = ''
    accept('')
    return
  }
  // Tanda minus yang baru diketik: tunggu angkanya.
  if (props.allowNegative && typed.trim() === '-') {
    text.value = '-'
    accept('')
    return
  }

  const parsed = parseMoneyInput(typed, { allowNegative: props.allowNegative })
  if (parsed === null) {
    refused.value = true
    await show(input, display(model.value), Math.max(digitsBeforeCaret - 1, 0))
    return
  }
  accept(parsed)
  await show(input, display(parsed), digitsBeforeCaret)
}

/**
 * Teks tempelan menggantikan seluruh isi dan dibaca dengan ketat: `1250000.00` dari
 * spreadsheet ditolak, bukan dibaca sebagai 125.000.000.
 */
function onPaste(event: ClipboardEvent): void {
  event.preventDefault()
  const parsed = parsePastedMoney(event.clipboardData?.getData('text') ?? '', {
    allowNegative: props.allowNegative,
  })
  if (parsed === null) {
    refused.value = true
    return
  }
  accept(parsed)
  text.value = display(parsed)
}

function onBlur(): void {
  // Tanda minus tanpa angka bukan nominal.
  if (text.value === '-') text.value = ''
  refused.value = false
}
</script>

<template>
  <InputText
    :id="id"
    :model-value="text"
    inputmode="numeric"
    autocomplete="off"
    :invalid="invalid"
    :aria-invalid="invalid ? 'true' : undefined"
    :aria-describedby="ariaDescribedby"
    fluid
    @input="onInput"
    @paste="onPaste"
    @blur="onBlur"
  />
  <small v-if="refused" role="status" class="text-surface-500">
    Hanya angka bulat rupiah, tanpa desimal.
  </small>
</template>
