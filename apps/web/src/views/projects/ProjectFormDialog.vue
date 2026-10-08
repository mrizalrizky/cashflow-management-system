<script setup lang="ts">
import Textarea from 'primevue/textarea'
import { createProject, updateProject, type UpdateProjectInput } from '@/api/projects'
import type { Project, ProjectStatus } from '@/api/types'
import DateField from '@/components/DateField.vue'
import FormDialog from '@/components/FormDialog.vue'
import FormField from '@/components/FormField.vue'
import MoneyInput from '@/components/MoneyInput.vue'
import SelectField from '@/components/SelectField.vue'
import TextField from '@/components/TextField.vue'
import { useEntityDialog } from '@/composables/useEntityDialog'
import { omit } from '@/lib/changes'
import { PROJECT_STATUS_OPTIONS } from '@/lib/labels'
import { isMoneyString } from '@/lib/money'
import { collectErrors, money, required } from '@/lib/validation'

const props = defineProps<{
  /** Proyek yang diubah; null berarti membuat proyek baru. */
  project: Project | null
}>()
const emit = defineEmits<{ saved: [project: Project] }>()
const visible = defineModel<boolean>('visible', { required: true })

interface Form {
  name: string
  clientName: string
  contractValue: string
  contractValueWithPpn: string
  status: ProjectStatus
  startDate: string | null
  endDate: string | null
  notes: string
}

type Input = Required<UpdateProjectInput>

const WITH_PPN_TOO_LOW = 'Nilai kontrak + PPN tidak boleh lebih kecil dari nilai kontrak'

/** Nilai berikut PPN boleh belum diisi (kosong atau 0), tetapi tidak lebih kecil dari kontraknya. */
function belowContractValue(withPpn: unknown, contractValue: string): boolean {
  if (!isMoneyString(withPpn) || !isMoneyString(contractValue)) return false
  return BigInt(withPpn) !== 0n && BigInt(withPpn) < BigInt(contractValue)
}

const { form, editing, submitting, fieldErrors, formError, onSubmit } = useEntityDialog<
  Project,
  Form,
  Input
>({
  visible,
  entity: () => props.project,
  blank: () => ({
    name: '',
    clientName: '',
    contractValue: '',
    contractValueWithPpn: '',
    status: 'ACTIVE',
    startDate: null,
    endDate: null,
    notes: '',
  }),
  fromEntity: (project) => ({
    name: project.name,
    clientName: project.clientName,
    contractValue: project.contractValue,
    contractValueWithPpn: project.contractValueWithPpn,
    status: project.status,
    startDate: project.startDate,
    endDate: project.endDate,
    notes: project.notes ?? '',
  }),
  toInput: (values) => ({
    name: values.name.trim(),
    clientName: values.clientName.trim(),
    contractValue: values.contractValue || '0',
    contractValueWithPpn: values.contractValueWithPpn || '0',
    status: values.status,
    startDate: values.startDate,
    endDate: values.endDate,
    notes: values.notes.trim() || null,
  }),
  validate: (values) =>
    collectErrors(values, {
      name: [required('Nama proyek')],
      clientName: [required('Nama klien')],
      contractValue: [money('Nilai kontrak', { required: false })],
      contractValueWithPpn: [
        money('Nilai kontrak + PPN', { required: false }),
        (withPpn) => (belowContractValue(withPpn, values.contractValue) ? WITH_PPN_TOO_LOW : null),
      ],
      // Tanggal kalender `YYYY-MM-DD` bisa dibandingkan langsung sebagai teks.
      endDate: [
        (end) =>
          typeof end === 'string' && values.startDate && end < values.startDate
            ? 'Tanggal selesai tidak boleh sebelum tanggal mulai'
            : null,
      ],
    }),
  // Proyek baru selalu berstatus aktif; API menolak status saat membuat.
  create: (input) => createProject(omit(input, 'status')),
  update: (project, changes) => updateProject(project.id, changes),
  onSaved: (project) => emit('saved', project),
})
</script>

<template>
  <FormDialog
    v-model:visible="visible"
    :title="editing ? 'Ubah proyek' : 'Tambah proyek'"
    :submitting="submitting"
    :form-error="formError"
    @submit="onSubmit"
  >
    <TextField
      id="project-name"
      v-model="form.name"
      label="Nama proyek"
      :error="fieldErrors.name"
    />
    <TextField
      id="project-client"
      v-model="form.clientName"
      label="Nama klien"
      :error="fieldErrors.clientName"
    />

    <FormField
      id="project-contract"
      v-slot="field"
      label="Nilai kontrak (Rp)"
      :error="fieldErrors.contractValue"
    >
      <MoneyInput
        :id="field.id"
        v-model="form.contractValue"
        :invalid="field.invalid"
        :aria-describedby="field.describedBy"
      />
      <small class="text-surface-500">Sebelum PPN. Kosong berarti 0.</small>
    </FormField>

    <FormField
      id="project-contract-ppn"
      v-slot="field"
      label="Nilai kontrak + PPN (Rp)"
      :error="fieldErrors.contractValueWithPpn"
    >
      <MoneyInput
        :id="field.id"
        v-model="form.contractValueWithPpn"
        :invalid="field.invalid"
        :aria-describedby="field.describedBy"
      />
      <small class="text-surface-500">
        Dasar sisa tagihan dan persentase diterima. Kosong berarti belum diisi.
      </small>
    </FormField>

    <SelectField
      v-if="editing"
      id="project-status"
      v-model="form.status"
      label="Status"
      :options="PROJECT_STATUS_OPTIONS"
      :error="fieldErrors.status"
    />

    <div class="grid gap-4 sm:grid-cols-2">
      <FormField id="project-start" v-slot="field" label="Tanggal mulai" :error="fieldErrors.startDate">
        <DateField :id="field.id" v-model="form.startDate" :invalid="field.invalid" />
      </FormField>
      <FormField id="project-end" v-slot="field" label="Tanggal selesai" :error="fieldErrors.endDate">
        <DateField :id="field.id" v-model="form.endDate" :invalid="field.invalid" />
      </FormField>
    </div>

    <FormField id="project-notes" v-slot="field" label="Catatan" :error="fieldErrors.notes">
      <Textarea
        :id="field.id"
        v-model="form.notes"
        rows="3"
        :invalid="field.invalid"
        :aria-describedby="field.describedBy"
        fluid
      />
    </FormField>
  </FormDialog>
</template>
