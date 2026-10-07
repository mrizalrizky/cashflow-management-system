<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import Button from 'primevue/button'
import MultiSelect from 'primevue/multiselect'
import { useConfirm } from 'primevue/useconfirm'
import { setProjectMembers } from '@/api/projects'
import type { Project } from '@/api/types'
import { listAssignableManagers } from '@/api/users'
import ErrorState from '@/components/ErrorState.vue'
import FormAlert from '@/components/FormAlert.vue'
import FormField from '@/components/FormField.vue'
import { useAsyncData } from '@/composables/useAsyncData'
import { useFormSubmit } from '@/composables/useFormSubmit'
import { useNotify } from '@/composables/useNotify'
import { storeToRefs } from 'pinia'
import { dangerConfirm } from '@/lib/confirm'
import { useSessionStore } from '@/stores/session'

const props = defineProps<{ project: Project }>()
const emit = defineEmits<{ updated: [project: Project] }>()

// Hanya SUPER_ADMIN yang mengatur koordinator; peran lain cukup melihat daftarnya.
const { isAdmin: canEdit } = storeToRefs(useSessionStore())
const confirm = useConfirm()
const notify = useNotify()

const managers = useAsyncData(listAssignableManagers)

const savedIds = computed(() => props.project.members.map((member) => member.id))
const selectedIds = ref<string[]>([])
watch(savedIds, (ids) => (selectedIds.value = [...ids]), { immediate: true })

/**
 * Pilihan: semua koordinator aktif, ditambah anggota saat ini yang sudah tidak aktif.
 * Yang terakhir tetap ditampilkan supaya menyimpan tidak diam-diam mencabut penugasannya.
 */
const options = computed(() => {
  const active = managers.data.value
  // Sebelum daftar koordinator aktif datang, belum bisa dikatakan siapa yang nonaktif.
  if (active === null) {
    return props.project.members.map((member) => ({ value: member.id, label: member.name }))
  }
  const activeIds = new Set(active.map((manager) => manager.id))
  const inactive = props.project.members.filter((member) => !activeIds.has(member.id))
  return [
    ...inactive.map((member) => ({ value: member.id, label: `${member.name} (nonaktif)` })),
    ...active.map((manager) => ({ value: manager.id, label: manager.name })),
  ]
})

const changed = computed(
  () => [...selectedIds.value].sort().join() !== [...savedIds.value].sort().join(),
)

const { submitting, fieldErrors, formError, submit } = useFormSubmit(() =>
  setProjectMembers(props.project.id, selectedIds.value),
)

async function save(): Promise<void> {
  const result = await submit()
  if (!result.ok) return
  notify.success('Koordinator proyek disimpan')
  emit('updated', result.value)
}

function onSave(): void {
  if (selectedIds.value.length > 0 || savedIds.value.length === 0) {
    void save()
    return
  }
  confirm.require(
    dangerConfirm({
      header: 'Hapus semua koordinator',
      message:
        'Hapus semua koordinator dari proyek ini? Tidak ada koordinator yang bisa melihatnya lagi.',
      acceptLabel: 'Hapus semua',
      accept: () => void save(),
    }),
  )
}

onMounted(() => {
  if (canEdit.value) void managers.reload()
})
</script>

<template>
  <template v-if="canEdit">
    <ErrorState
      v-if="managers.error.value"
      :message="managers.error.value"
      @retry="managers.reload"
    />
    <div v-else class="flex max-w-xl flex-col gap-4">
      <FormAlert :message="formError" />
      <FormField
        id="project-members"
        v-slot="field"
        label="Koordinator proyek"
        :error="fieldErrors.userIds"
      >
        <MultiSelect
          v-model="selectedIds"
          :options="options"
          option-label="label"
          option-value="value"
          placeholder="Pilih koordinator"
          display="chip"
          filter
          :loading="managers.loading.value"
          :invalid="field.invalid"
          :aria-labelledby="field.labelId"
          fluid
        />
        <small class="text-surface-500">
          Koordinator hanya melihat proyek yang ditugaskan kepadanya.
        </small>
      </FormField>
      <div>
        <Button
          label="Simpan koordinator"
          :loading="submitting"
          :disabled="submitting || !changed"
          data-testid="save-members"
          @click="onSave"
        />
      </div>
    </div>
  </template>

  <template v-else>
    <p v-if="project.members.length === 0" class="text-surface-500">Belum ada koordinator.</p>
    <ul v-else class="flex flex-col gap-2">
      <li v-for="member in project.members" :key="member.id" data-testid="member">
        <p class="font-medium">{{ member.name }}</p>
        <p class="text-sm text-surface-500">{{ member.email }}</p>
      </li>
    </ul>
  </template>
</template>
