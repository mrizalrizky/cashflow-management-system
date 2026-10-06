<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import InputText from 'primevue/inputtext'
import { formatAmount, parseMoneyInput } from '@/lib/money'

/** Kotak isian nominal rupiah. Nilainya string digit (`''` bila kosong), tampilannya berpemisah ribuan. */
const props = defineProps<{
  id: string
  invalid?: boolean
  /** Mengizinkan nilai minus, mis. saldo awal rekening yang sedang minus. */
  allowNegative?: boolean
  ariaDescribedby?: string
}>()

const model = defineModel<string>({ required: true })

function display(value: string): string {
  return value === '' ? '' : formatAmount(value)
}

const text = ref(display(model.value))

// Nilai diubah dari luar (mis. formulir diisi ulang).
watch(model, (value) => {
  if (text.value !== '-' || value !== '') text.value = display(value)
})

async function onInput(raw: string | undefined): Promise<void> {
  const typed = raw ?? ''
  if (typed.trim() === '') {
    text.value = ''
    model.value = ''
    return
  }
  // Tanda minus yang baru diketik: tunggu angkanya.
  if (props.allowNegative && typed.trim() === '-') {
    text.value = '-'
    model.value = ''
    return
  }

  const parsed = parseMoneyInput(typed, { allowNegative: props.allowNegative })
  if (parsed === null) {
    // Bukan nominal: kembalikan tampilan semula. Nilai ditulis dulu supaya Vue melihat
    // perubahan dan menimpa apa yang sudah telanjur tampil di kotak isian.
    text.value = typed
    await nextTick()
    text.value = display(model.value)
    return
  }
  model.value = parsed
  text.value = display(parsed)
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
    @update:model-value="onInput"
  />
</template>
