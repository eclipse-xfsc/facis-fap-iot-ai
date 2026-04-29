<script setup lang="ts">
import { ref, computed } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import StatusBadge from './StatusBadge.vue'
import EmptyState from './EmptyState.vue'

interface ColumnDef {
  field: string
  header: string
  sortable?: boolean
  type?: 'status' | 'date' | 'number' | 'text' | 'actions'
  width?: string
}

interface FilterChip {
  label: string
  value: string
  field: string
}

const props = withDefaults(defineProps<{
  title?: string
  subtitle?: string
  columns: ColumnDef[]
  data: Record<string, unknown>[]
  loading?: boolean
  filters?: FilterChip[]
  searchFields?: string[]
  rowsPerPage?: number
  emptyIcon?: string
  emptyTitle?: string
  emptyMessage?: string
}>(), {
  loading: false,
  rowsPerPage: 15,
  emptyIcon: 'pi-inbox',
  emptyTitle: 'No data',
  emptyMessage: 'No records found matching your criteria.',
  searchFields: () => []
})

const emit = defineEmits<{
  (e: 'row-select', row: Record<string, unknown>): void
  (e: 'action', payload: { action: string; row: Record<string, unknown> }): void
}>()

const searchQuery = ref('')
const activeFilters = ref<Set<string>>(new Set())
const currentPage = ref(0)

const filteredData = computed(() => {
  let result = [...props.data]

  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    const fields = props.searchFields.length > 0
      ? props.searchFields
      : props.columns.filter(c => c.type !== 'actions').map(c => c.field)

    result = result.filter(row =>
      fields.some(f => String(row[f] ?? '').toLowerCase().includes(q))
    )
  }

  if (activeFilters.value.size > 0 && props.filters) {
    for (const filterKey of activeFilters.value) {
      const chip = props.filters.find(f => f.value === filterKey)
      if (chip) {
        result = result.filter(row => String(row[chip.field]) === chip.value)
      }
    }
  }

  return result
})

function toggleFilter(value: string): void {
  if (activeFilters.value.has(value)) {
    activeFilters.value.delete(value)
  } else {
    activeFilters.value.add(value)
  }
}

function formatDate(val: unknown): string {
  if (!val) return '—'
  try {
    return new Date(String(val)).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
  } catch {
    return String(val)
  }
}

function formatNumber(val: unknown): string {
  if (val == null) return '—'
  const n = Number(val)
  return isNaN(n) ? String(val) : n.toLocaleString('en-GB', { maximumFractionDigits: 2 })
}
</script>

<template>
  <div class="dtp-wrapper">
    <div v-if="title || subtitle || searchFields.length > 0" class="dtp-toolbar">
      <div v-if="title || subtitle" class="dtp-toolbar__info">
        <span v-if="title" class="dtp-toolbar__title">{{ title }}</span>
        <span v-if="subtitle" class="dtp-toolbar__subtitle">{{ subtitle }}</span>
      </div>

      <div class="dtp-toolbar__controls">
        <div v-if="filters && filters.length > 0" class="dtp-filters">
          <button
            v-for="chip in filters"
            :key="chip.value"
            class="dtp-filter-chip"
            :class="{ 'dtp-filter-chip--active': activeFilters.has(chip.value) }"
            @click="toggleFilter(chip.value)"
          >
            {{ chip.label }}
          </button>
        </div>

        <span class="p-input-icon-left dtp-search">
          <i class="pi pi-search"></i>
          <InputText
            v-model="searchQuery"
            placeholder="Search..."
            class="dtp-search__input"
            size="small"
          />
        </span>

        <slot name="toolbar-actions" />
      </div>
    </div>

    <DataTable
      :value="filteredData"
      :loading="loading"
      :rows="rowsPerPage"
      :paginator="filteredData.length > rowsPerPage"
      paginator-template="RowsPerPageDropdown FirstPageLink PrevPageLink CurrentPageReport NextPageLink LastPageLink"
      current-page-report-template="{first}–{last} of {totalRecords}"
      :rows-per-page-options="[10, 15, 25, 50]"
      scrollable
      scroll-height="flex"
      row-hover
      removable-sort
      @row-click="emit('row-select', $event.data as Record<string, unknown>)"
    >
      <template #empty>
        <EmptyState :icon="emptyIcon" :title="emptyTitle" :message="emptyMessage" />
      </template>

      <Column
        v-for="col in columns"
        :key="col.field"
        :field="col.field"
        :header="col.header"
        :sortable="col.sortable ?? col.type !== 'actions'"
        :style="col.width ? { width: col.width } : {}"
      >
        <template #body="{ data: row }">
          <!-- Status column -->
          <StatusBadge v-if="col.type === 'status'" :status="String(row[col.field] ?? '')" size="sm" />

          <!-- Date column -->
          <span v-else-if="col.type === 'date'" class="dtp-cell--muted">
            {{ formatDate(row[col.field]) }}
          </span>

          <!-- Number column -->
          <span v-else-if="col.type === 'number'">
            {{ formatNumber(row[col.field]) }}
          </span>

          <!-- Actions column -->
          <div v-else-if="col.type === 'actions'" class="dtp-actions" @click.stop>
            <slot name="actions" :row="row" />
          </div>

          <!-- Default text -->
          <span v-else>{{ row[col.field] ?? '—' }}</span>
        </template>
      </Column>
    </DataTable>
  </div>
</template>

<style scoped>
.dtp-wrapper {
  background: var(--facis-surface);
  border: 1px solid var(--facis-border);
  border-radius: var(--facis-radius);
  box-shadow: var(--facis-shadow);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.dtp-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--facis-border);
  flex-wrap: wrap;
}

.dtp-toolbar__info {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.dtp-toolbar__title {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--facis-text);
}

.dtp-toolbar__subtitle {
  font-size: 0.786rem;
  color: var(--facis-text-secondary);
}

.dtp-toolbar__controls {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.dtp-filters {
  display: flex;
  gap: 0.375rem;
  flex-wrap: wrap;
}

.dtp-filter-chip {
  font-size: 0.75rem;
  font-weight: 500;
  padding: 0.25rem 0.75rem;
  border-radius: 20px;
  border: 1px solid var(--facis-border);
  background: var(--facis-surface);
  color: var(--facis-text-secondary);
  cursor: pointer;
  transition: all 0.15s;
}

.dtp-filter-chip:hover {
  border-color: var(--facis-primary);
  color: var(--facis-primary);
}

.dtp-filter-chip--active {
  background: var(--facis-primary-light);
  border-color: var(--facis-primary);
  color: var(--facis-primary);
}

.dtp-search {
  position: relative;
  display: flex;
  align-items: center;
}

.dtp-search .pi-search {
  position: absolute;
  left: 0.6rem;
  color: var(--facis-text-muted);
  font-size: 0.8rem;
  z-index: 1;
}

.dtp-search__input {
  padding-left: 2rem !important;
  width: 220px;
}

.dtp-cell--muted {
  color: var(--facis-text-secondary);
  font-size: 0.8rem;
}

.dtp-actions {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}
</style>
