<script setup lang="ts">
import { useRouter } from 'vue-router'
import Button from 'primevue/button'

const router = useRouter()
</script>

<template>
  <div class="not-found">
    <div class="not-found__content">
      <div class="not-found__code">404</div>
      <h1 class="not-found__title">Page not found</h1>
      <p class="not-found__msg">The page you are looking for does not exist or has been moved.</p>
      <Button label="Back to Dashboard" icon="pi pi-home" @click="router.push('/dashboard')" />
    </div>
  </div>
</template>

<style scoped>
.not-found {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: calc(100vh - var(--facis-topbar-height));
  padding: 2rem;
}

.not-found__content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  text-align: center;
}

.not-found__code {
  font-size: 6rem;
  font-weight: 900;
  color: var(--facis-border-strong);
  line-height: 1;
  letter-spacing: -0.05em;
}

.not-found__title {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--facis-text);
}

.not-found__msg {
  font-size: 0.875rem;
  color: var(--facis-text-secondary);
  margin-bottom: 0.5rem;
}
</style>
