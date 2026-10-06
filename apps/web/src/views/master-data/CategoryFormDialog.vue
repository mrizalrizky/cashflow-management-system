<script setup lang="ts">
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import { createCategory, updateCategory, type CreateCategoryInput } from '@/api/categories'
import type { Category, TxType } from '@/api/types'
import FormDialog from '@/components/FormDialog.vue'
import FormField from '@/components/FormField.vue'
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
}

const { form, editing, submitting, fieldErrors, formError, onSubmit } = useEntityDialog<
  Category,
  Form,
  CreateCategoryInput
>({
  visible,
  entity: () => props.category,
  blank: () => ({ name: '', type: null }),
  fromEntity: (category) => ({ name: category.name, type: category.type }),
  toInput: (values) => ({ name: values.name.trim(), type: values.type! }),
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
    <FormField id="category-name" v-slot="field" label="Nama" :error="fieldErrors.name">
      <InputText
        :id="field.id"
        v-model="form.name"
        :invalid="field.invalid"
        :aria-describedby="field.describedBy"
        fluid
      />
    </FormField>

    <FormField id="category-type" v-slot="field" label="Tipe" :error="fieldErrors.type">
      <template v-if="editing">
        <p class="font-medium">{{ form.type ? txTypeLabel(form.type) : '-' }}</p>
        <small class="text-surface-500">Tipe kategori tidak bisa diubah.</small>
      </template>
      <Select
        v-else
        v-model="form.type"
        :options="TX_TYPE_OPTIONS"
        option-label="label"
        option-value="value"
        placeholder="Pilih tipe"
        :invalid="field.invalid"
        :aria-labelledby="field.labelId"
        fluid
      />
    </FormField>
  </FormDialog>
</template>
