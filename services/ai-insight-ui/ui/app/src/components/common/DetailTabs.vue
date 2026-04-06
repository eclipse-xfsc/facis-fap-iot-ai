<script setup lang="ts">
import { ref, watch } from 'vue'
import TabView from 'primevue/tabview'
import TabPanel from 'primevue/tabpanel'

interface Tab {
  label: string
  icon?: string
  disabled?: boolean
}

const props = withDefaults(defineProps<{
  tabs: Tab[]
  modelValue?: number
}>(), {
  modelValue: 0
})

const emit = defineEmits<{
  (e: 'update:modelValue', index: number): void
  (e: 'tab-change', index: number): void
}>()

const activeIndex = ref(props.modelValue)

watch(() => props.modelValue, (val) => {
  activeIndex.value = val
})

function onTabChange(event: { index: number }): void {
  activeIndex.value = event.index
  emit('update:modelValue', event.index)
  emit('tab-change', event.index)
}
</script>

<template>
  <TabView :active-index="activeIndex" @tab-change="onTabChange">
    <TabPanel v-for="(tab, idx) in tabs" :key="idx" :disabled="tab.disabled">
      <template #header>
        <span class="detail-tab__header">
          <i v-if="tab.icon" :class="`pi ${tab.icon}`"></i>
          {{ tab.label }}
        </span>
      </template>
      <slot :name="`tab-${idx}`" />
    </TabPanel>
  </TabView>
</template>

<style scoped>
.detail-tab__header {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.875rem;
}
</style>
