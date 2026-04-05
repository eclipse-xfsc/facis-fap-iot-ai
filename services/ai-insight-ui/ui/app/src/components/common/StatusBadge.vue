<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  status: string
  size?: 'sm' | 'md'
  showDot?: boolean
}>(), {
  size: 'md',
  showDot: true
})

type StatusConfig = { color: string; bg: string; label: string }

const STATUS_MAP: Record<string, StatusConfig> = {
  healthy:      { color: '#15803d', bg: '#dcfce7', label: 'Healthy' },
  active:       { color: '#15803d', bg: '#dcfce7', label: 'Active' },
  online:       { color: '#15803d', bg: '#dcfce7', label: 'Online' },
  success:      { color: '#15803d', bg: '#dcfce7', label: 'Success' },
  valid:        { color: '#15803d', bg: '#dcfce7', label: 'Valid' },
  resolved:     { color: '#15803d', bg: '#dcfce7', label: 'Resolved' },
  available:    { color: '#15803d', bg: '#dcfce7', label: 'Available' },
  ready:        { color: '#15803d', bg: '#dcfce7', label: 'Ready' },

  warning:      { color: '#92400e', bg: '#fef3c7', label: 'Warning' },
  dimmed:       { color: '#92400e', bg: '#fef3c7', label: 'Dimmed' },
  partial:      { color: '#92400e', bg: '#fef3c7', label: 'Partial' },
  maintenance:  { color: '#92400e', bg: '#fef3c7', label: 'Maintenance' },
  acknowledged: { color: '#92400e', bg: '#fef3c7', label: 'Acknowledged' },
  processing:   { color: '#92400e', bg: '#fef3c7', label: 'Processing' },
  draft:        { color: '#92400e', bg: '#fef3c7', label: 'Draft' },
  invited:      { color: '#92400e', bg: '#fef3c7', label: 'Invited' },

  error:        { color: '#991b1b', bg: '#fee2e2', label: 'Error' },
  critical:     { color: '#991b1b', bg: '#fee2e2', label: 'Critical' },
  fault:        { color: '#991b1b', bg: '#fee2e2', label: 'Fault' },
  unavailable:  { color: '#991b1b', bg: '#fee2e2', label: 'Unavailable' },
  invalid:      { color: '#991b1b', bg: '#fee2e2', label: 'Invalid' },
  failure:      { color: '#991b1b', bg: '#fee2e2', label: 'Failure' },

  offline:      { color: '#475569', bg: '#f1f5f9', label: 'Offline' },
  inactive:     { color: '#475569', bg: '#f1f5f9', label: 'Inactive' },
  off:          { color: '#475569', bg: '#f1f5f9', label: 'Off' },
  deprecated:   { color: '#475569', bg: '#f1f5f9', label: 'Deprecated' },

  info:         { color: '#1d4ed8', bg: '#dbeafe', label: 'Info' },
  open:         { color: '#1d4ed8', bg: '#dbeafe', label: 'Open' }
}

const config = computed<StatusConfig>(() => {
  const key = props.status?.toLowerCase() ?? ''
  return STATUS_MAP[key] ?? { color: '#475569', bg: '#f1f5f9', label: props.status }
})
</script>

<template>
  <span
    class="status-badge"
    :class="`status-badge--${size}`"
    :style="{ color: config.color, background: config.bg }"
  >
    <span v-if="showDot" class="status-badge__dot" :style="{ background: config.color }"></span>
    {{ config.label }}
  </span>
</template>

<style scoped>
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  border-radius: 20px;
  font-weight: 600;
  white-space: nowrap;
}

.status-badge--sm {
  font-size: 0.7rem;
  padding: 0.2rem 0.5rem;
}

.status-badge--md {
  font-size: 0.75rem;
  padding: 0.25rem 0.625rem;
}

.status-badge__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}
</style>
