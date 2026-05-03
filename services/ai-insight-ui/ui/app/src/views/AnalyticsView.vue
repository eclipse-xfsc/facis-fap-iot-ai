<script setup lang="ts">
// Sub-tab strip removed: only Overview remains. The other four sub-tabs
// (Trends/Correlations/Anomalies/Recommendations) all needed /history
// endpoints that the simulation REST flow does not expose.
</script>

<template>
  <div class="use-case-layout">
    <div class="use-case-content"><RouterView /></div>
  </div>
</template>

<style scoped>
.use-case-layout { display: flex; flex-direction: column; height: 100%; }
.use-case-tabs { display: flex; gap: 0; padding: 0 1.5rem; border-bottom: 2px solid var(--facis-border); background: var(--facis-surface); flex-shrink: 0; }
.use-case-tab { display: flex; align-items: center; gap: 0.4rem; padding: 0.875rem 1.125rem; border: none; background: transparent; color: var(--facis-text-secondary); font-size: 0.875rem; font-weight: 500; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -2px; transition: all 0.12s; white-space: nowrap; }
.use-case-tab:hover { color: var(--facis-text); }
.use-case-tab--active { color: var(--facis-primary); border-bottom-color: var(--facis-primary); }
.use-case-content { flex: 1; overflow: auto; }
</style>
