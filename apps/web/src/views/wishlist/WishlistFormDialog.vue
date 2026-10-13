<script setup lang="ts">
import Checkbox from 'primevue/checkbox'
import { createWishlistItem, updateWishlistItem, type WishlistInput } from '@/api/wishlist'
import type { WishlistItem } from '@/api/types'
import FormDialog from '@/components/FormDialog.vue'
import FormField from '@/components/FormField.vue'
import MoneyInput from '@/components/MoneyInput.vue'
import TextField from '@/components/TextField.vue'
import { useEntityDialog } from '@/composables/useEntityDialog'
import { amountRules } from '@/lib/transaction-rules'
import { collectErrors, required } from '@/lib/validation'
import AnswerField from './AnswerField.vue'

const props = defineProps<{
  /** Barang yang diubah; null berarti menambah barang baru. */
  item: WishlistItem | null
}>()
const emit = defineEmits<{ saved: [item: WishlistItem] }>()
const visible = defineModel<boolean>('visible', { required: true })

type Form = WishlistInput

const { form, editing, submitting, fieldErrors, formError, onSubmit } = useEntityDialog<
  WishlistItem,
  Form,
  WishlistInput
>({
  visible,
  entity: () => props.item,
  blank: () => ({
    name: '',
    price: '',
    reason: '',
    similarOwned: '',
    valueAdded: '',
    usageDuration: '',
    includeFinance: true,
  }),
  fromEntity: (item) => ({
    name: item.name,
    price: item.price,
    reason: item.reason,
    similarOwned: item.similarOwned,
    valueAdded: item.valueAdded,
    usageDuration: item.usageDuration,
    includeFinance: item.includeFinance,
  }),
  toInput: (values) => ({
    name: values.name.trim(),
    price: values.price,
    reason: values.reason.trim(),
    similarOwned: values.similarOwned.trim(),
    valueAdded: values.valueAdded.trim(),
    usageDuration: values.usageDuration.trim(),
    includeFinance: values.includeFinance,
  }),
  validate: (values) =>
    collectErrors(values, {
      name: [required('Nama barang')],
      price: amountRules('Harga'),
      reason: [required('Jawaban')],
      similarOwned: [required('Jawaban')],
      valueAdded: [required('Jawaban')],
      usageDuration: [required('Jawaban')],
    }),
  create: createWishlistItem,
  update: (item, changes) => updateWishlistItem(item.id, changes),
  onSaved: (item) => emit('saved', item),
})
</script>

<template>
  <FormDialog
    v-model:visible="visible"
    :title="editing ? 'Ubah barang' : 'Tambah barang'"
    :submitting="submitting"
    :form-error="formError"
    @submit="onSubmit"
  >
    <TextField id="wish-name" v-model="form.name" label="Nama barang" :error="fieldErrors.name" />
    <FormField id="wish-price" v-slot="field" label="Harga (Rp)" :error="fieldErrors.price">
      <MoneyInput :id="field.id" v-model="form.price" :invalid="field.invalid" :aria-describedby="field.describedBy" />
    </FormField>
    <AnswerField
      id="wish-reason"
      v-model="form.reason"
      label="Kenapa saya menginginkannya?"
      :error="fieldErrors.reason"
    />
    <AnswerField
      id="wish-similar"
      v-model="form.similarOwned"
      label="Apakah saya sudah punya yang mirip?"
      :error="fieldErrors.similarOwned"
    />
    <AnswerField
      id="wish-value"
      v-model="form.valueAdded"
      label="Bagaimana barang ini menambah nilai dalam hidup saya?"
      :error="fieldErrors.valueAdded"
    />
    <AnswerField
      id="wish-duration"
      v-model="form.usageDuration"
      label="Berapa lama saya membutuhkannya, dan untuk apa?"
      :error="fieldErrors.usageDuration"
    />
    <label class="flex items-start gap-2 text-sm">
      <Checkbox v-model="form.includeFinance" input-id="wish-finance" binary />
      <span>
        <span class="font-medium">Sertakan ringkasan keuangan (hanya total)</span><br />
        <span class="text-surface-500">Saldo, rata-rata pemasukan dan pengeluaran, dan cicilan berjalan ikut dinilai AI.</span>
      </span>
    </label>
  </FormDialog>
</template>
