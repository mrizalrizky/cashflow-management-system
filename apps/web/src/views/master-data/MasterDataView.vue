<script setup lang="ts">
import Tab from 'primevue/tab'
import TabList from 'primevue/tablist'
import TabPanel from 'primevue/tabpanel'
import TabPanels from 'primevue/tabpanels'
import Tabs from 'primevue/tabs'
import PageHeader from '@/components/PageHeader.vue'
import AccountsTab from './AccountsTab.vue'
import CategoriesTab from './CategoriesTab.vue'
</script>

<template>
  <PageHeader title="Master data" />
  <!-- `lazy`: isi tab baru dimuat saat tabnya dibuka. -->
  <Tabs value="accounts" lazy>
    <TabList>
      <Tab value="accounts">Akun</Tab>
      <Tab value="categories">Kategori</Tab>
    </TabList>
    <TabPanels>
      <TabPanel value="accounts"><AccountsTab /></TabPanel>
      <TabPanel value="categories"><CategoriesTab /></TabPanel>
    </TabPanels>
  </Tabs>
</template>
