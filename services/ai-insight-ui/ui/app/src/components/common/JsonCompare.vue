<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  original: Record<string, unknown>
  transformed: Record<string, unknown>
  originalLabel?: string
  transformedLabel?: string
}>()

type DiffLine = {
  key: string
  originalValue: string
  transformedValue: string
  type: 'added' | 'removed' | 'changed' | 'unchanged'
}

function flatten(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(result, flatten(v as Record<string, unknown>, key))
    } else {
      result[key] = JSON.stringify(v)
    }
  }
  return result
}

const diff = computed<DiffLine[]>(() => {
  const orig = flatten(props.original)
  const trans = flatten(props.transformed)
  const allKeys = new Set([...Object.keys(orig), ...Object.keys(trans)])

  return Array.from(allKeys).sort().map(key => {
    const ov = orig[key]
    const tv = trans[key]
    let type: DiffLine['type'] = 'unchanged'
    if (ov === undefined) type = 'added'
    else if (tv === undefined) type = 'removed'
    else if (ov !== tv) type = 'changed'
    return { key, originalValue: ov ?? '', transformedValue: tv ?? '', type }
  })
})

const stats = computed(() => ({
  added: diff.value.filter(d => d.type === 'added').length,
  removed: diff.value.filter(d => d.type === 'removed').length,
  changed: diff.value.filter(d => d.type === 'changed').length,
  unchanged: diff.value.filter(d => d.type === 'unchanged').length
}))
</script>

<template>
  <div class="json-compare">
    <div class="json-compare__stats">
      <span class="json-compare__stat json-compare__stat--added">+{{ stats.added }} added</span>
      <span class="json-compare__stat json-compare__stat--changed">~{{ stats.changed }} changed</span>
      <span class="json-compare__stat json-compare__stat--removed">-{{ stats.removed }} removed</span>
      <span class="json-compare__stat json-compare__stat--unchanged">{{ stats.unchanged }} unchanged</span>
    </div>

    <div class="json-compare__grid">
      <div class="json-compare__panel">
        <div class="json-compare__panel-header">{{ originalLabel ?? 'Original (Remote Schema)' }}</div>
        <div class="json-compare__rows">
          <div
            v-for="line in diff"
            :key="`orig-${line.key}`"
            class="json-compare__row"
            :class="`json-compare__row--${line.type}`"
          >
            <span class="json-compare__field">{{ line.key }}</span>
            <span class="json-compare__val">{{ line.type === 'added' ? '' : line.originalValue }}</span>
          </div>
        </div>
      </div>

      <div class="json-compare__panel">
        <div class="json-compare__panel-header">{{ transformedLabel ?? 'Transformed (Local Schema)' }}</div>
        <div class="json-compare__rows">
          <div
            v-for="line in diff"
            :key="`trans-${line.key}`"
            class="json-compare__row"
            :class="`json-compare__row--${line.type}`"
          >
            <span class="json-compare__field">{{ line.key }}</span>
            <span class="json-compare__val">{{ line.type === 'removed' ? '' : line.transformedValue }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.json-compare {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.json-compare__stats {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.json-compare__stat {
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.2rem 0.6rem;
  border-radius: 20px;
}

.json-compare__stat--added    { background: #dcfce7; color: #15803d; }
.json-compare__stat--changed  { background: #fef3c7; color: #92400e; }
.json-compare__stat--removed  { background: #fee2e2; color: #991b1b; }
.json-compare__stat--unchanged { background: var(--facis-surface-2); color: var(--facis-text-secondary); }

.json-compare__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.json-compare__panel {
  border: 1px solid var(--facis-border);
  border-radius: var(--facis-radius-sm);
  overflow: hidden;
}

.json-compare__panel-header {
  padding: 0.5rem 0.875rem;
  background: var(--facis-surface-2);
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--facis-text-secondary);
  border-bottom: 1px solid var(--facis-border);
}

.json-compare__rows {
  font-family: var(--facis-font-mono);
  font-size: 0.75rem;
}

.json-compare__row {
  display: flex;
  gap: 0.5rem;
  padding: 0.3rem 0.875rem;
  border-bottom: 1px solid var(--facis-border);
}

.json-compare__row:last-child { border-bottom: none; }

.json-compare__row--added    { background: #f0fdf4; }
.json-compare__row--removed  { background: #fff1f2; }
.json-compare__row--changed  { background: #fffbeb; }
.json-compare__row--unchanged { background: transparent; }

.json-compare__field {
  color: var(--facis-text-secondary);
  flex-shrink: 0;
  min-width: 140px;
}

.json-compare__val {
  color: var(--facis-text);
  word-break: break-all;
}
</style>
