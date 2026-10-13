<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import Button from 'primevue/button'
import ProgressSpinner from 'primevue/progressspinner'
import Tag from 'primevue/tag'
import { getWishlistItem, updateWishlistItem } from '@/api/wishlist'
import type { WishlistItem, WishlistStatus } from '@/api/types'
import ErrorState from '@/components/ErrorState.vue'
import MoneyText from '@/components/MoneyText.vue'
import PageHeader from '@/components/PageHeader.vue'
import { useAsyncData } from '@/composables/useAsyncData'
import { useNotify } from '@/composables/useNotify'
import { WISHLIST_STATUS_SEVERITY, wishlistStatusLabel } from '@/lib/wishlist'
import { PATHS } from '@/router/paths'
import WishlistFormDialog from './WishlistFormDialog.vue'
import WishlistReviewCard from './WishlistReviewCard.vue'

const NOT_FOUND_STATUSES = [400, 404]

const route = useRoute()
const notify = useNotify()
const itemId = computed(() => String(route.params.id))

const { data: item, loading, error, errorStatus, reload } = useAsyncData(() => getWishlistItem(itemId.value))
watch(
  itemId,
  () => {
    item.value = null
    void reload()
  },
  { immediate: true },
)

const notFound = computed(
  () => errorStatus.value !== null && NOT_FOUND_STATUSES.includes(errorStatus.value),
)

const answers = computed(() =>
  item.value
    ? [
        { label: 'Kenapa saya menginginkannya?', value: item.value.reason },
        { label: 'Apakah saya sudah punya yang mirip?', value: item.value.similarOwned },
        { label: 'Bagaimana barang ini menambah nilai dalam hidup saya?', value: item.value.valueAdded },
        { label: 'Berapa lama saya membutuhkannya, dan untuk apa?', value: item.value.usageDuration },
      ]
    : [],
)

const editing = ref(false)
const changingStatus = ref(false)

function show(latest: WishlistItem): void {
  item.value = latest
}

function onSaved(saved: WishlistItem): void {
  notify.success(`${saved.name} disimpan`)
  show(saved)
}

async function setStatus(status: WishlistStatus): Promise<void> {
  if (!item.value) return
  changingStatus.value = true
  try {
    show(await updateWishlistItem(item.value.id, { status }))
  } catch (failure) {
    notify.error(failure, 'Status gagal diubah')
  } finally {
    changingStatus.value = false
  }
}

</script>

<template>
  <RouterLink :to="PATHS.wishlist" class="mb-3 inline-flex items-center gap-2 text-sm text-primary-700 hover:underline">
    <i class="pi pi-arrow-left" aria-hidden="true" />
    Kembali ke wishlist
  </RouterLink>

  <p v-if="notFound" class="py-6 text-surface-600">Barang tidak ditemukan.</p>
  <ErrorState v-else-if="error && !item" :message="error" @retry="reload" />
  <div v-else-if="!item" class="flex justify-center py-10">
    <ProgressSpinner v-if="loading" aria-label="Memuat" />
  </div>

  <template v-else>
    <PageHeader :title="item.name">
      <template #actions>
        <Tag :severity="WISHLIST_STATUS_SEVERITY[item.status]" :value="wishlistStatusLabel(item.status)" />
        <Button label="Ubah" icon="pi pi-pencil" severity="secondary" @click="editing = true" />
      </template>
    </PageHeader>

    <div class="mb-6 flex flex-wrap items-center gap-2">
      <template v-if="item.status === 'WAITING'">
        <Button
          label="Dibeli"
          icon="pi pi-check"
          :disabled="changingStatus"
          data-testid="mark-bought"
          @click="setStatus('BOUGHT')"
        />
        <Button
          label="Batal"
          icon="pi pi-times"
          severity="secondary"
          :disabled="changingStatus"
          data-testid="mark-cancelled"
          @click="setStatus('CANCELLED')"
        />
      </template>
      <Button
        v-else
        label="Kembalikan ke Menunggu"
        icon="pi pi-undo"
        severity="secondary"
        variant="outlined"
        :disabled="changingStatus"
        data-testid="mark-waiting"
        @click="setStatus('WAITING')"
      />
    </div>

    <div class="grid gap-6 lg:grid-cols-2">
      <dl class="flex flex-col gap-4 rounded-xl border border-surface-200 bg-surface-0 p-4">
        <div>
          <dt class="text-sm text-surface-600">Harga</dt>
          <dd class="font-medium"><MoneyText :amount="item.price" /></dd>
        </div>
        <div v-for="answer in answers" :key="answer.label">
          <dt class="text-sm text-surface-600">{{ answer.label }}</dt>
          <dd class="break-words whitespace-pre-line">{{ answer.value }}</dd>
        </div>
      </dl>
      <WishlistReviewCard :item="item" @reviewed="show" />
    </div>

    <WishlistFormDialog v-model:visible="editing" :item="item" @saved="onSaved" />
  </template>
</template>
