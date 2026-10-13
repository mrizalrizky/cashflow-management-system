<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import { listWishlist } from '@/api/wishlist'
import type { WishlistItem, WishlistStatus } from '@/api/types'
import ErrorState from '@/components/ErrorState.vue'
import FilterSelect from '@/components/FilterSelect.vue'
import MoneyText from '@/components/MoneyText.vue'
import PageHeader from '@/components/PageHeader.vue'
import { useAsyncData } from '@/composables/useAsyncData'
import { useNotify } from '@/composables/useNotify'
import {
  VERDICT_SEVERITY,
  verdictLabel,
  WISHLIST_STATUS_OPTIONS,
  WISHLIST_STATUS_SEVERITY,
  wishlistStatusLabel,
} from '@/lib/wishlist'
import { wishlistPath } from '@/router/paths'
import WishlistFormDialog from './WishlistFormDialog.vue'

const notify = useNotify()
const status = ref<WishlistStatus | null | undefined>('WAITING')

const { data, loading, error, reload } = useAsyncData(() => listWishlist({ status: status.value ?? null }))
watch(status, reload)
onMounted(reload)

const formOpen = ref(false)

function onSaved(item: WishlistItem): void {
  notify.success(`${item.name} disimpan`)
  void reload()
}
</script>

<template>
  <PageHeader title="Wishlist">
    <template #actions>
      <Button label="Tambah barang" icon="pi pi-plus" data-testid="add-wish" @click="formOpen = true" />
    </template>
  </PageHeader>

  <div class="mb-4 w-full sm:w-56">
    <FilterSelect v-model="status" :options="WISHLIST_STATUS_OPTIONS" placeholder="Semua" label="Status" />
  </div>

  <ErrorState v-if="error && !data" :message="error" @retry="reload" />
  <template v-else-if="data">
    <p v-if="data.length === 0" class="py-6 text-center text-surface-500">Belum ada barang</p>
    <ul v-else class="flex flex-col gap-3" :aria-busy="loading">
      <li
        v-for="item in data"
        :key="item.id"
        class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-surface-200 bg-surface-0 p-4"
        :data-testid="`wish-${item.id}`"
      >
        <div class="min-w-0">
          <RouterLink :to="wishlistPath(item.id)" class="font-medium text-primary-700 hover:underline">
            {{ item.name }}
          </RouterLink>
          <p class="text-sm text-surface-600"><MoneyText :amount="item.price" /></p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <Tag :severity="WISHLIST_STATUS_SEVERITY[item.status]" :value="wishlistStatusLabel(item.status)" />
          <Tag
            v-if="item.review"
            :severity="VERDICT_SEVERITY[item.review.verdict]"
            :value="verdictLabel(item.review.verdict)"
          />
          <span v-else class="text-sm text-surface-500">Belum dinilai</span>
        </div>
      </li>
    </ul>
  </template>

  <WishlistFormDialog v-model:visible="formOpen" :item="null" @saved="onSaved" />
</template>
