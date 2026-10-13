<script setup lang="ts">
import Tag from 'primevue/tag'
import type { InstallmentStatus } from '@/api/types'
import { INSTALLMENT_STATUS_SEVERITY, installmentStatusLabel } from '@/lib/installments'

defineProps<{ status: InstallmentStatus }>()
</script>

<template>
  <Tag :severity="INSTALLMENT_STATUS_SEVERITY[status]" :value="installmentStatusLabel(status)" />
</template>
