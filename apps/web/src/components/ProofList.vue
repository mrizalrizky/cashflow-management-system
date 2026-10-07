<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import Dialog from 'primevue/dialog'
import { useConfirm } from 'primevue/useconfirm'
import { downloadAttachment, removeAttachment } from '@/api/attachments'
import type { Attachment } from '@/api/types'
import RowActionButton from '@/components/RowActionButton.vue'
import { useNotify } from '@/composables/useNotify'
import { dangerConfirm } from '@/lib/confirm'
import { saveBlob } from '@/lib/download'
import { formatDate } from '@/lib/format'
import { formatFileSize, isImageType } from '@/lib/proof-files'

/**
 * Bukti yang sudah tersimpan pada sebuah transaksi. Berkas diambil dengan access token dan
 * hanya gambar yang ditampilkan langsung; jenis lain selalu diunduh.
 */
defineProps<{ attachments: Attachment[]; canRemove: boolean }>()
const emit = defineEmits<{ removed: [id: string] }>()

const notify = useNotify()
const confirm = useConfirm()

/** Bukti yang sedang diambil atau dihapus; tombolnya dimatikan sementara. */
const busyId = ref<string | null>(null)
const preview = ref<{ url: string; name: string } | null>(null)

async function withFile(attachment: Attachment, use: (blob: Blob) => void): Promise<void> {
  busyId.value = attachment.id
  try {
    use(await downloadAttachment(attachment.id))
  } catch (cause) {
    notify.error(cause, 'Gagal mengambil bukti')
  } finally {
    busyId.value = null
  }
}

function download(attachment: Attachment): Promise<void> {
  return withFile(attachment, (blob) => saveBlob(blob, attachment.fileName))
}

function show(attachment: Attachment): Promise<void> {
  return withFile(attachment, (blob) => {
    closePreview()
    preview.value = { url: URL.createObjectURL(blob), name: attachment.fileName }
  })
}

function closePreview(): void {
  if (preview.value) URL.revokeObjectURL(preview.value.url)
  preview.value = null
}

async function remove(attachment: Attachment): Promise<void> {
  busyId.value = attachment.id
  try {
    await removeAttachment(attachment.id)
    emit('removed', attachment.id)
    notify.success('Bukti dihapus')
  } catch (cause) {
    notify.error(cause, 'Gagal menghapus bukti')
  } finally {
    busyId.value = null
  }
}

function confirmRemove(attachment: Attachment): void {
  confirm.require(
    dangerConfirm({
      header: 'Hapus bukti',
      message: `Hapus bukti ${attachment.fileName}? Berkasnya tidak bisa dikembalikan.`,
      acceptLabel: 'Hapus',
      accept: () => void remove(attachment),
    }),
  )
}

onBeforeUnmount(closePreview)
</script>

<template>
  <p v-if="attachments.length === 0" class="text-surface-500">Belum ada bukti</p>
  <ul v-else class="divide-y divide-surface-200 rounded-lg border border-surface-200">
    <li
      v-for="attachment in attachments"
      :key="attachment.id"
      class="flex items-center justify-between gap-2 px-3 py-2"
    >
      <div class="min-w-0">
        <p class="truncate font-medium">{{ attachment.fileName }}</p>
        <p class="text-sm text-surface-500">
          {{ formatFileSize(attachment.sizeBytes) }} · {{ formatDate(attachment.createdAt) }}
        </p>
      </div>
      <div class="flex shrink-0 gap-1">
        <RowActionButton
          v-if="isImageType(attachment.mimeType)"
          icon="pi pi-eye"
          :label="`Lihat ${attachment.fileName}`"
          :test-id="`preview-${attachment.id}`"
          :disabled="busyId === attachment.id"
          @click="show(attachment)"
        />
        <RowActionButton
          icon="pi pi-download"
          :label="`Unduh ${attachment.fileName}`"
          :test-id="`download-${attachment.id}`"
          :disabled="busyId === attachment.id"
          @click="download(attachment)"
        />
        <RowActionButton
          v-if="canRemove"
          icon="pi pi-trash"
          :label="`Hapus ${attachment.fileName}`"
          :test-id="`remove-${attachment.id}`"
          :disabled="busyId === attachment.id"
          @click="confirmRemove(attachment)"
        />
      </div>
    </li>
  </ul>

  <Dialog
    :visible="preview !== null"
    modal
    dismissable-mask
    :header="preview?.name"
    class="w-full max-w-3xl"
    @update:visible="closePreview"
  >
    <img
      v-if="preview"
      :src="preview.url"
      :alt="preview.name"
      class="mx-auto max-h-[75vh] max-w-full object-contain"
    />
  </Dialog>
</template>
