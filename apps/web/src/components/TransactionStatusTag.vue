<script setup lang="ts">
import Tag from 'primevue/tag'
import type { TxStatus } from '@/api/types'
import { TX_STATUS_SEVERITY, txStatusLabel } from '@/lib/labels'

defineProps<{ status: TxStatus }>()
</script>

<template>
  <Tag :severity="TX_STATUS_SEVERITY[status]" :value="txStatusLabel(status)" />
</template>
