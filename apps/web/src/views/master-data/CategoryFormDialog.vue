<script setup lang="ts">
import Checkbox from 'primevue/checkbox'
import { createCategory, updateCategory, type CreateCategoryInput } from '@/api/categories'
import type { Category, TxType } from '@/api/types'
import FormDialog from '@/components/FormDialog.vue'
import FormField from '@/components/FormField.vue'
import SelectField from '@/components/SelectField.vue'
import TextField from '@/components/TextField.vue'
import { useEntityDialog } from '@/composables/useEntityDialog'
import { omit } from '@/lib/changes'
import { TX_TYPE_OPTIONS, txTypeLabel } from '@/lib/labels'
import { collectErrors, required } from '@/lib/validation'

const props = defineProps<{
  /** Kategori yang diubah; null berarti membuat kategori baru. */
  category: Category | null
}>()
const emit = defineEmits<{ saved: [category: Category] }>()
const visible = defineModel<boolean>('visible', { required: true })

interface Form {
  name: string
  type: TxType | null
  isInstallment: boolean
}

const { form, editing, submitting, fieldErrors, formError, onSubmit } = useEntityDialog<
  Category,
  Form,
  CreateCategoryInput
>({
  visible,
  entity: () => props.category,
  blank: () => ({ name: '', type: null, isInstallment: false }),
  fromEntity: (category) => ({ name: category.name, type: category.type, isInstallment: category.isInstallment }),
  toInput: (values) => ({
    name: values.name.trim(),
    type: values.type!,
    // Hanya kategori pengeluaran yang bisa menjadi kategori cicilan.
    isInstallment: values.type === 'OUT' && values.isInstallment,
  }),
  validate: (values) =>
    collectErrors(values, {
      name: [required('Nama')],
      type: [(value) => (value ? null : 'Tipe wajib diisi')],
    }),
  create: createCategory,
  // Tipe tidak pernah dikirim saat mengubah: API tidak mengizinkannya berubah.
  update: (category, changes) => updateCategory(category.id, omit(changes, 'type')),
  onSaved: (category) => emit('saved', category),
  fieldForStatus: { 409: 'name' },
})
</script>

<template>
  <FormDialog
    v-model:visible="visible"
    :title="editing ? 'Ubah kategori' : 'Tambah kategori'"
    :submitting="submitting"
    :form-error="formError"
    @submit="onSubmit"
  >
    <TextField
      id="category-name"
      v-model="form.name"
      label="Nama"
      :error="fieldErrors.name"
    />

    <!-- Tipe hanya bisa dipilih saat membuat. -->
    <FormField v-if="editing" id="category-type" label="Tipe">
      <p class="font-medium">{{ form.type ? txTypeLabel(form.type) : '-' }}</p>
      <small class="text-surface-500">Tipe kategori tidak bisa diubah.</small>
    </FormField>
    <SelectField
      v-else
      id="category-type"
      v-model="form.type"
      label="Tipe"
      :options="TX_TYPE_OPTIONS"
      placeholder="Pilih tipe"
      :error="fieldErrors.type"
    />

    <label v-if="form.type === 'OUT'" class="flex items-start gap-2 text-sm">
      <Checkbox v-model="form.isInstallment" input-id="category-installment" binary />
      <span>
        <span class="font-medium">Kategori cicilan</span><br />
        <span class="text-surface-500">Transaksinya wajib memilih cicilan yang dibayar.</span>
      </span>
    </label>
  </FormDialog>
</template>
