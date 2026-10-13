<script setup lang="ts">
import { computed, ref } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import type { WishlistItem } from '@/api/types'
import { useNotify } from '@/composables/useNotify'
import { useTransactionOptions } from '@/composables/useTransactionOptions'
import { formatRupiah } from '@/lib/money'
import InstallmentFormDialog from '@/views/installments/InstallmentFormDialog.vue'
import TransactionFormDialog from '@/views/transactions/TransactionFormDialog.vue'

/** Jalan pintas setelah barang dibeli: catat pengeluarannya, atau buat cicilannya. Boleh dilewati. */
const props = defineProps<{ item: WishlistItem }>()
const visible = defineModel<boolean>('visible', { required: true })

const notify = useNotify()
const options = useTransactionOptions()
const recording = ref(false)
const startingInstallment = ref(false)

const expense = computed(() => ({ amount: props.item.price, description: props.item.name }))
// Nominal per bulan tidak bisa diturunkan dari harga, jadi harganya dicatat di catatan.
const installment = computed(() => ({
  name: props.item.name,
  notes: `Harga barang ${formatRupiah(props.item.price)}`,
}))

function open(target: 'expense' | 'installment'): void {
  visible.value = false
  if (target === 'expense') recording.value = true
  else startingInstallment.value = true
}
</script>

<template>
  <Dialog v-model:visible="visible" modal header="Barang dibeli" :style="{ width: '28rem' }" :breakpoints="{ '575px': '92vw' }">
    <div class="flex flex-col gap-3" data-testid="bought-shortcuts">
      <p>Catat pembeliannya sekarang? Isiannya sudah terisi nama dan harga barang.</p>
      <Button label="Catat pengeluaran" icon="pi pi-receipt" data-testid="shortcut-expense" @click="open('expense')" />
      <Button
        label="Buat cicilan"
        icon="pi pi-calendar"
        severity="secondary"
        data-testid="shortcut-installment"
        @click="open('installment')"
      />
      <Button label="Lewati" severity="secondary" variant="text" data-testid="shortcut-skip" @click="visible = false" />
    </div>
  </Dialog>

  <TransactionFormDialog
    v-model:visible="recording"
    :transaction="null"
    :options="options"
    :initial="expense"
    @saved="notify.success('Pengeluaran dicatat')"
  />
  <InstallmentFormDialog
    v-model:visible="startingInstallment"
    :installment="null"
    :initial="installment"
    @saved="(saved) => notify.success(`${saved.name} disimpan`)"
  />
</template>
