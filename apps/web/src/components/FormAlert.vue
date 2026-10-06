<script setup lang="ts">
import Message from 'primevue/message'

defineProps<{ message: string | null }>()
</script>

<template>
  <div v-if="message" role="alert">
    <Message severity="error" :closable="false">{{ message }}</Message>
  </div>
</template>
