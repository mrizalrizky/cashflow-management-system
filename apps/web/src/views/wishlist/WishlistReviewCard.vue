<script setup lang="ts">
import { ref } from 'vue'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Tag from 'primevue/tag'
import { reviewWishlistItem } from '@/api/wishlist'
import type { WishlistItem } from '@/api/types'
import { errorMessage } from '@/lib/errors'
import { formatDateTime } from '@/lib/format'
import { VERDICT_SEVERITY, verdictLabel } from '@/lib/wishlist'

const props = defineProps<{ item: WishlistItem }>()
const emit = defineEmits<{ reviewed: [item: WishlistItem] }>()

const asking = ref(false)
const failure = ref<string | null>(null)

/** Penilaian lama tetap tampil bila permintaan baru gagal. */
async function ask(): Promise<void> {
  asking.value = true
  failure.value = null
  try {
    emit('reviewed', await reviewWishlistItem(props.item.id))
  } catch (cause) {
    failure.value = errorMessage(cause, 'Penilaian AI gagal. Coba lagi.')
  } finally {
    asking.value = false
  }
}
</script>

<template>
  <section class="flex flex-col gap-3 rounded-xl border border-surface-200 bg-surface-0 p-4" data-testid="review-card">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h2 class="text-lg font-semibold">Pendapat AI</h2>
      <Button
        :label="item.review ? 'Minta pendapat lagi' : 'Minta pendapat AI'"
        icon="pi pi-sparkles"
        :loading="asking"
        :disabled="asking"
        data-testid="ask-ai"
        @click="ask"
      />
    </div>

    <Message v-if="failure" severity="error" :closable="false">{{ failure }}</Message>
    <p v-if="asking" class="text-sm text-surface-600">AI sedang menilai; bisa sampai satu menit.</p>

    <p v-if="!item.review" class="text-surface-500">Belum ada penilaian.</p>
    <template v-else>
      <div class="flex flex-wrap items-center gap-2">
        <Tag :severity="VERDICT_SEVERITY[item.review.verdict]" :value="verdictLabel(item.review.verdict)" />
        <span class="text-sm text-surface-600">{{ formatDateTime(item.review.reviewedAt) }}</span>
      </div>
      <Message v-if="item.review.answersChanged" severity="warn" :closable="false">
        Jawaban sudah diubah sejak penilaian ini.
      </Message>
      <ul class="list-disc pl-5">
        <li v-for="reason in item.review.reasons" :key="reason">{{ reason }}</li>
      </ul>
      <p><span class="font-medium">Saran:</span> {{ item.review.suggestion }}</p>
      <p class="text-xs text-surface-500">
        {{ item.review.financeSnapshot ? 'Termasuk ringkasan keuangan (hanya total).' : 'Tanpa ringkasan keuangan.' }}
      </p>
    </template>
  </section>
</template>
