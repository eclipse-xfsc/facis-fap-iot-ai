<script setup lang="ts">
import { useRouter, useRoute } from 'vue-router'
import Button from 'primevue/button'

const router = useRouter()
const route = useRoute()

const tabs = [
  { label: 'Overview', to: '/use-cases/smart-energy/overview', icon: 'pi-home' },
  { label: 'Assets', to: '/use-cases/smart-energy/assets', icon: 'pi-gauge' },
  { label: 'Context', to: '/use-cases/smart-energy/context', icon: 'pi-cloud' },
  { label: 'AI Insights', to: '/use-cases/smart-energy/insights', icon: 'pi-sparkles' },
  { label: 'Data Products', to: '/use-cases/smart-energy/data-products', icon: 'pi-box' }
]

function isTabActive(to: string): boolean {
  return route.path.startsWith(to)
}
</script>

<template>
  <div class="use-case-layout">
    <div class="use-case-tabs">
      <button
        v-for="tab in tabs"
        :key="tab.to"
        class="use-case-tab"
        :class="{ 'use-case-tab--active': isTabActive(tab.to) }"
        @click="router.push(tab.to)"
      >
        <i :class="`pi ${tab.icon}`"></i>
        {{ tab.label }}
      </button>
    </div>
    <div class="use-case-content">
      <RouterView />
    </div>
  </div>
</template>

<style scoped>
.use-case-layout {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.use-case-tabs {
  display: flex;
  gap: 0;
  padding: 0 1.5rem;
  border-bottom: 2px solid var(--facis-border);
  background: var(--facis-surface);
  flex-shrink: 0;
}

.use-case-tab {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.875rem 1.125rem;
  border: none;
  background: transparent;
  color: var(--facis-text-secondary);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  transition: all 0.12s;
  white-space: nowrap;
}

.use-case-tab:hover {
  color: var(--facis-text);
}

.use-case-tab--active {
  color: var(--facis-primary);
  border-bottom-color: var(--facis-primary);
}

.use-case-content {
  flex: 1;
  overflow: auto;
}
</style>
