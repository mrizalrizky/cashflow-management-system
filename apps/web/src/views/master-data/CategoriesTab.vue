<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Tag from 'primevue/tag'
import ToggleSwitch from 'primevue/toggleswitch'
import { listCategories, updateCategory } from '@/api/categories'
import type { Category, TxType } from '@/api/types'
import ActiveTag from '@/components/ActiveTag.vue'
import ErrorState from '@/components/ErrorState.vue'
import FilterSelect from '@/components/FilterSelect.vue'
import RowActionButton from '@/components/RowActionButton.vue'
import TableCard from '@/components/TableCard.vue'
import ToggleActiveButton from '@/components/ToggleActiveButton.vue'
import { useAsyncData } from '@/composables/useAsyncData'
import { useNotify } from '@/composables/useNotify'
import { useToggleActive } from '@/composables/useToggleActive'
import { TX_TYPE_OPTIONS } from '@/lib/labels'
import CategoryFormDialog from './CategoryFormDialog.vue'

const notify = useNotify()

const type = ref<TxType | null>()
const showInactive = ref(false)

// Kategori jumlahnya sedikit, jadi dimuat seluruhnya tanpa halaman.
const { data, loading, error, reload } = useAsyncData(() =>
  listCategories({ type: type.value ?? undefined, isActive: showInactive.value ? undefined : true }),
)
watch([type, showInactive], reload)
onMounted(reload)

/** Satu kelompok per tipe, hanya untuk tipe yang ada isinya. */
const groups = computed(() =>
  TX_TYPE_OPTIONS.map((option) => ({
    ...option,
    categories: (data.value ?? []).filter((category) => category.type === option.value),
  })).filter((group) => group.categories.length > 0),
)

const formOpen = ref(false)
const selected = ref<Category | null>(null)

function openForm(category: Category | null): void {
  selected.value = category
  formOpen.value = true
}

function onSaved(category: Category): void {
  notify.success(`${category.name} disimpan`)
  void reload()
}

const toggleActive = useToggleActive<Category>({
  update: (id, isActive) => updateCategory(id, { isActive }),
  onChanged: () => void reload(),
  describe: () => 'Kategori ini tidak bisa lagi dipilih untuk transaksi baru.',
})
</script>

<template>
  <div class="mb-4 flex flex-wrap items-center gap-3">
    <div class="w-full sm:w-56">
      <FilterSelect v-model="type" :options="TX_TYPE_OPTIONS" placeholder="Semua tipe" label="Tipe" />
    </div>
    <label class="flex items-center gap-2 text-sm">
      <ToggleSwitch v-model="showInactive" input-id="show-inactive-categories" />
      Tampilkan nonaktif
    </label>
    <Button
      class="ml-auto"
      label="Tambah kategori"
      icon="pi pi-plus"
      data-testid="add-category"
      @click="openForm(null)"
    />
  </div>

  <ErrorState v-if="error" :message="error" @retry="reload" />
  <p v-else-if="!loading && groups.length === 0" class="py-6 text-center text-surface-500">
    Belum ada kategori
  </p>

  <section
    v-for="group in groups"
    v-else
    :key="group.value"
    class="mb-6"
    :data-testid="`group-${group.value}`"
  >
    <h2 class="mb-2 font-semibold">{{ group.label }}</h2>
    <TableCard>
      <DataTable :value="group.categories" data-key="id" :loading="loading">
        <Column header="Nama">
          <template #body="{ data: category }: { data: Category }">
            <span class="font-medium" :data-testid="`category-${category.id}`">
              {{ category.name }}
              <Tag v-if="category.isSystem" class="ml-2" severity="info" value="Sistem" />
            </span>
          </template>
        </Column>
        <Column header="Status">
          <template #body="{ data: category }: { data: Category }">
            <ActiveTag :active="category.isActive" />
          </template>
        </Column>
        <Column header="Aksi" class="text-right">
          <template #body="{ data: category }: { data: Category }">
            <!-- Kategori sistem dipakai logika transfer dan tidak bisa diubah. -->
            <div v-if="!category.isSystem" class="flex justify-end gap-1">
              <RowActionButton
                icon="pi pi-pencil"
                :label="`Ubah ${category.name}`"
                :test-id="`edit-${category.id}`"
                @click="openForm(category)"
              />
              <ToggleActiveButton :item="category" @toggle="toggleActive(category)" />
            </div>
          </template>
        </Column>
      </DataTable>
    </TableCard>
  </section>

  <CategoryFormDialog v-model:visible="formOpen" :category="selected" @saved="onSaved" />
</template>
