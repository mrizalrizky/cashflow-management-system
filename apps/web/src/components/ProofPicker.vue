<script setup lang="ts">
import { ref } from 'vue'
import Button from 'primevue/button'
import RowActionButton from '@/components/RowActionButton.vue'
import { checkProofFile, formatFileSize, PROOF_ACCEPT, TOO_MANY_PROOFS } from '@/lib/proof-files'

/**
 * Memilih berkas bukti (dari galeri, kamera, atau dengan menyeretnya) sebelum diunggah.
 * Berkas yang pasti ditolak API disaring di sini, dengan alasan yang terbaca.
 */
const props = defineProps<{
  /** Jumlah berkas terbanyak yang boleh ada di daftar ini. */
  max: number
  disabled?: boolean
}>()

const files = defineModel<File[]>({ required: true })

const input = ref<HTMLInputElement | null>(null)
const dragging = ref(false)
const problems = ref<string[]>([])

function sameFile(a: File, b: File): boolean {
  return a.name === b.name && a.size === b.size && a.lastModified === b.lastModified
}

function add(candidates: File[]): void {
  if (props.disabled) return
  const accepted = [...files.value]
  const refused: string[] = []
  let overflow = false

  for (const file of candidates) {
    if (accepted.some((existing) => sameFile(existing, file))) continue
    const reason = checkProofFile(file)
    if (reason) refused.push(`${file.name}: ${reason}`)
    else if (accepted.length >= props.max) overflow = true
    else accepted.push(file)
  }

  problems.value = overflow ? [...refused, TOO_MANY_PROOFS] : refused
  if (accepted.length !== files.value.length) files.value = accepted
}

function onChoose(event: Event): void {
  const target = event.target as HTMLInputElement
  add(Array.from(target.files ?? []))
  // Dikosongkan supaya berkas yang sama bisa dipilih lagi setelah dihapus dari daftar.
  target.value = ''
}

function onDrop(event: DragEvent): void {
  dragging.value = false
  add(Array.from(event.dataTransfer?.files ?? []))
}

function remove(file: File): void {
  files.value = files.value.filter((existing) => existing !== file)
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <div
      data-testid="proof-drop"
      class="flex flex-col items-center gap-2 rounded-lg border border-dashed p-4 text-center"
      :class="dragging ? 'border-primary-500 bg-primary-50' : 'border-surface-300'"
      @dragover.prevent="dragging = !disabled"
      @dragleave="dragging = false"
      @drop.prevent="onDrop"
    >
      <input
        ref="input"
        type="file"
        class="hidden"
        multiple
        :accept="PROOF_ACCEPT"
        :disabled="disabled"
        @change="onChoose"
      />
      <Button
        label="Pilih berkas"
        icon="pi pi-paperclip"
        severity="secondary"
        :disabled="disabled"
        data-testid="proof-choose"
        @click="input?.click()"
      />
      <small class="text-surface-500">
        Foto (JPG, PNG, WebP) atau PDF, maksimal 10 MB per berkas. Bisa juga diseret ke sini.
      </small>
    </div>

    <ul v-if="problems.length > 0" role="alert" class="text-sm text-red-600">
      <li v-for="problem in problems" :key="problem">{{ problem }}</li>
    </ul>

    <ul v-if="files.length > 0" class="divide-y divide-surface-200 rounded-lg border border-surface-200">
      <li
        v-for="file in files"
        :key="`${file.name}-${file.size}-${file.lastModified}`"
        class="flex items-center justify-between gap-2 px-3 py-1"
      >
        <span class="min-w-0 truncate text-sm">{{ file.name }}</span>
        <span class="flex shrink-0 items-center gap-1 text-sm text-surface-500">
          {{ formatFileSize(file.size) }}
          <RowActionButton
            icon="pi pi-times"
            :label="`Hapus ${file.name}`"
            :disabled="disabled"
            @click="remove(file)"
          />
        </span>
      </li>
    </ul>
  </div>
</template>
