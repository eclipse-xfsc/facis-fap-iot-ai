<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'

interface Breadcrumb {
  label: string
  to?: string
}

const props = defineProps<{
  title: string
  subtitle?: string
  breadcrumbs?: Breadcrumb[]
}>()

const router = useRouter()

const crumbs = computed(() => [
  { label: 'Home', to: '/dashboard' },
  ...(props.breadcrumbs ?? [])
])

function navigate(to: string | undefined): void {
  if (to) router.push(to)
}
</script>

<template>
  <div class="page-header">
    <nav class="page-header__breadcrumb" aria-label="breadcrumb">
      <ol class="breadcrumb-list">
        <li
          v-for="(crumb, idx) in crumbs"
          :key="idx"
          class="breadcrumb-item"
          :class="{ 'breadcrumb-item--active': idx === crumbs.length - 1 }"
        >
          <span
            v-if="idx < crumbs.length - 1 && crumb.to"
            class="breadcrumb-link"
            @click="navigate(crumb.to)"
          >{{ crumb.label }}</span>
          <span v-else class="breadcrumb-current">{{ crumb.label }}</span>
          <i v-if="idx < crumbs.length - 1" class="pi pi-chevron-right breadcrumb-sep"></i>
        </li>
      </ol>
    </nav>

    <div class="page-header__main">
      <div class="page-header__text">
        <h1 class="page-header__title">{{ title }}</h1>
        <p v-if="subtitle" class="page-header__subtitle">{{ subtitle }}</p>
      </div>
      <div v-if="$slots.actions" class="page-header__actions">
        <slot name="actions" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.page-header {
  padding: 1.5rem 1.5rem 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.page-header__breadcrumb {
  display: flex;
  align-items: center;
}

.breadcrumb-list {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  list-style: none;
  flex-wrap: wrap;
}

.breadcrumb-item {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.breadcrumb-link {
  font-size: 0.786rem;
  color: var(--facis-text-secondary);
  cursor: pointer;
  transition: color 0.15s;
}

.breadcrumb-link:hover {
  color: var(--facis-primary);
}

.breadcrumb-current {
  font-size: 0.786rem;
  color: var(--facis-text);
  font-weight: 500;
}

.breadcrumb-sep {
  font-size: 0.6rem;
  color: var(--facis-text-muted);
}

.page-header__main {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.page-header__text {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.page-header__title {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--facis-text);
  letter-spacing: -0.02em;
  line-height: 1.2;
}

.page-header__subtitle {
  font-size: 0.875rem;
  color: var(--facis-text-secondary);
}

.page-header__actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}
</style>
