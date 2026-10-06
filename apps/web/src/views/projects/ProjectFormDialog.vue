<script setup lang="ts">
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Textarea from 'primevue/textarea'
import { createProject, updateProject, type UpdateProjectInput } from '@/api/projects'
import type { Project, ProjectStatus } from '@/api/types'
import DateField from '@/components/DateField.vue'
import FormDialog from '@/components/FormDialog.vue'
import FormField from '@/components/FormField.vue'
import MoneyInput from '@/components/MoneyInput.vue'
import { useEntityDialog } from '@/composables/useEntityDialog'
import { omit } from '@/lib/changes'
import { PROJECT_STATUS_OPTIONS } from '@/lib/labels'
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
  status: ProjectStatus
  startDate: string | null
  endDate: string | null
  notes: string
}

type Input = Required<UpdateProjectInput>

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
    status: 'ACTIVE',
    startDate: null,
    endDate: null,
    notes: '',
  }),
  fromEntity: (project) => ({
    name: project.name,
    clientName: project.clientName,
    contractValue: project.contractValue,
    status: project.status,
    startDate: project.startDate,
    endDate: project.endDate,
    notes: project.notes ?? '',
  }),
  toInput: (values) => ({
    name: values.name.trim(),
    clientName: values.clientName.trim(),
    contractValue: values.contractValue || '0',
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
    <FormField id="project-name" v-slot="field" label="Nama proyek" :error="fieldErrors.name">
      <InputText
        :id="field.id"
        v-model="form.name"
        :invalid="field.invalid"
        :aria-describedby="field.describedBy"
        fluid
      />
    </FormField>

    <FormField id="project-client" v-slot="field" label="Nama klien" :error="fieldErrors.clientName">
      <InputText
        :id="field.id"
        v-model="form.clientName"
        :invalid="field.invalid"
        :aria-describedby="field.describedBy"
        fluid
      />
    </FormField>

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
    </FormField>

    <FormField
      v-if="editing"
      id="project-status"
      v-slot="field"
      label="Status"
      :error="fieldErrors.status"
    >
      <Select
        v-model="form.status"
        :options="PROJECT_STATUS_OPTIONS"
        option-label="label"
        option-value="value"
        :invalid="field.invalid"
        :aria-labelledby="field.labelId"
        fluid
      />
    </FormField>

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
