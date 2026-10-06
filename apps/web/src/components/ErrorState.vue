<script setup lang="ts">
import Button from 'primevue/button'
import Message from 'primevue/message'

defineProps<{ message: string }>()
defineEmits<{ retry: [] }>()
</script>

<template>
  <div role="alert" class="flex flex-col items-start gap-3">
    <Message severity="error" :closable="false">{{ message }}</Message>
    <Button
      label="Coba lagi"
      icon="pi pi-refresh"
      severity="secondary"
      data-testid="retry"
      @click="$emit('retry')"
    />
  </div>
</template>
