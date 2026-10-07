<script setup lang="ts">
import Button from 'primevue/button'
import Message from 'primevue/message'
import type { TransactionOptions } from '@/composables/useTransactionOptions'

/** Pemberitahuan bahwa pilihan akun, kategori dan proyek gagal dimuat, dengan cara mengulanginya. */
defineProps<{ options: TransactionOptions }>()
</script>

<template>
  <Message v-if="options.error.value" severity="warn" :closable="false">
    <div class="flex flex-wrap items-center gap-3">
      <span>Pilihan gagal dimuat: {{ options.error.value }}</span>
      <Button
        label="Muat ulang pilihan"
        size="small"
        severity="secondary"
        :loading="options.loading.value"
        data-testid="reload-options"
        @click="options.reload"
      />
    </div>
  </Message>
</template>
