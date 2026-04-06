<script setup lang="ts">
const props = withDefaults(defineProps<{
  icon?: string
  title?: string
  message?: string
}>(), {
  icon: 'pi-inbox',
  title: 'No data available',
  message: 'There are no records to display at this time.'
})
</script>

<template>
  <div class="empty-state">
    <div class="empty-state__icon">
      <i :class="`pi ${icon}`"></i>
    </div>
    <div class="empty-state__title">{{ title }}</div>
    <div class="empty-state__message">{{ message }}</div>
    <slot />
  </div>
</template>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 3rem 2rem;
  text-align: center;
}

.empty-state__icon {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: var(--facis-surface-2);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--facis-text-muted);
  font-size: 1.75rem;
}

.empty-state__title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--facis-text);
}

.empty-state__message {
  font-size: 0.875rem;
  color: var(--facis-text-secondary);
  max-width: 340px;
}
</style>
