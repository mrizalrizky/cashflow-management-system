<script setup lang="ts">
import { computed, ref, watch, type WritableComputedRef } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import ToggleSwitch from 'primevue/toggleswitch'
import type { TransactionFilters } from '@/api/transactions'
import DateField from '@/components/DateField.vue'
import FilterBar from '@/components/FilterBar.vue'
import FilterSelect from '@/components/FilterSelect.vue'
import { useDebouncedInput } from '@/composables/useDebouncedInput'
import { projectLabel, type TransactionOptions } from '@/composables/useTransactionOptions'
import { TX_STATUS_OPTIONS, TX_TYPE_OPTIONS, type Option } from '@/lib/labels'
import { OVERHEAD } from '@/lib/transactions'

const props = defineProps<{
  options: TransactionOptions
  /** Tawarkan pilihan transaksi tanpa proyek. */
  allowOverhead?: boolean
  /** Tawarkan sakelar untuk menyembunyikan transfer antar akun. */
  transferSwitch?: boolean
}>()

const model = defineModel<TransactionFilters>({ required: true })

function patch(change: TransactionFilters): void {
  model.value = { ...model.value, ...change }
}

/** Sebuah filter yang diteruskan apa adanya; dropdown yang dikosongkan berarti tanpa filter. */
function field<K extends keyof TransactionFilters>(
  key: K,
): WritableComputedRef<TransactionFilters[K]> {
  return computed({
    get: () => model.value[key],
    set: (value) => patch({ [key]: value ?? undefined }),
  })
}

const status = field('status')
const accountId = field('accountId')
const categoryId = field('categoryId')

const type = computed({
  get: () => model.value.type,
  set: (value) => {
    // Kategori yang tidak cocok dengan tipe baru ikut dilepas.
    const fits = props.options.categoriesFor(value).some((c) => c.id === model.value.categoryId)
    patch({ type: value ?? undefined, categoryId: fits ? model.value.categoryId : undefined })
  },
})

const project = computed({
  get: () => (model.value.overhead ? OVERHEAD : model.value.projectId),
  set: (value) =>
    patch({
      projectId: value && value !== OVERHEAD ? value : undefined,
      overhead: value === OVERHEAD ? true : undefined,
    }),
})

/** Menyala berarti transfer ikut tampil, yaitu bawaan API; hanya "sembunyikan" yang dikirim. */
const showTransfers = computed({
  get: () => model.value.includeTransfers !== false,
  set: (on) => patch({ includeTransfers: on ? undefined : false }),
})

const search = useDebouncedInput((value) => patch({ search: value || undefined }))

const dateFrom = ref<string | null>(null)
const dateTo = ref<string | null>(null)
const rangeBackwards = computed(
  () => dateFrom.value !== null && dateTo.value !== null && dateFrom.value > dateTo.value,
)
watch([dateFrom, dateTo], () => {
  // Rentang yang terbalik tidak dikirim; pengguna diberi tahu di bawah kolomnya.
  patch({
    dateFrom: rangeBackwards.value ? undefined : (dateFrom.value ?? undefined),
    dateTo: rangeBackwards.value ? undefined : (dateTo.value ?? undefined),
  })
})

function named(items: { id: string; name: string }[]): Option<string>[] {
  return items.map((item) => ({ value: item.id, label: item.name }))
}

const accountOptions = computed(() => named(props.options.accounts.value))
const categoryOptions = computed(() => named(props.options.categoriesFor(model.value.type)))
const projectOptions = computed<Option<string>[]>(() => [
  ...(props.allowOverhead ? [{ value: OVERHEAD, label: 'Overhead (tanpa proyek)' }] : []),
  ...props.options.projects.value.map((p) => ({ value: p.id, label: projectLabel(p) })),
])

function reset(): void {
  search.value = ''
  dateFrom.value = null
  dateTo.value = null
  model.value = {}
}
</script>

<template>
  <FilterBar>
    <InputText
      id="transaction-search"
      v-model="search"
      placeholder="Cari keterangan"
      aria-label="Cari keterangan"
      fluid
    />
    <div>
      <div class="grid grid-cols-2 gap-2">
        <DateField
          id="filter-date-from"
          v-model="dateFrom"
          :invalid="rangeBackwards"
          placeholder="Dari tanggal"
          aria-label="Dari tanggal"
        />
        <DateField
          id="filter-date-to"
          v-model="dateTo"
          :invalid="rangeBackwards"
          placeholder="Sampai tanggal"
          aria-label="Sampai tanggal"
        />
      </div>
      <small v-if="rangeBackwards" role="alert" class="text-red-600">
        Tanggal awal tidak boleh setelah tanggal akhir
      </small>
    </div>
    <FilterSelect v-model="type" :options="TX_TYPE_OPTIONS" placeholder="Semua tipe" label="Tipe" />
    <FilterSelect
      v-model="status"
      :options="TX_STATUS_OPTIONS"
      placeholder="Semua status"
      label="Status"
    />
    <FilterSelect
      v-model="accountId"
      :options="accountOptions"
      placeholder="Semua akun"
      label="Akun"
    />
    <FilterSelect
      v-model="categoryId"
      :options="categoryOptions"
      placeholder="Semua kategori"
      label="Kategori"
    />
    <FilterSelect
      v-model="project"
      :options="projectOptions"
      placeholder="Semua proyek"
      label="Proyek"
    />
    <div class="flex items-center justify-between gap-3 sm:col-span-2">
      <label v-if="transferSwitch" class="flex items-center gap-2 text-sm">
        <ToggleSwitch v-model="showTransfers" input-id="filter-transfers" />
        <span>Tampilkan transfer</span>
      </label>
      <span v-else />
      <Button
        label="Reset"
        icon="pi pi-filter-slash"
        severity="secondary"
        text
        data-testid="reset-filters"
        @click="reset"
      />
    </div>
  </FilterBar>
</template>
