<script setup lang="ts">
import Button from 'primevue/button'
import PageHeader from '@/components/common/PageHeader.vue'
import DataTablePage from '@/components/common/DataTablePage.vue'

interface RemoteSchema {
  id: string
  name: string
  catalogue: string
  standard: string
  format: string
  version: string
  source: string
  url: string
  lastFetched: string
  linkedMappings: number
  status: 'linked' | 'unlinked' | 'outdated'
}

const remoteSchemas: RemoteSchema[] = [
  {
    id: 'rsc-001',
    name: 'IEC-61968/MeterReading',
    catalogue: 'IEC CIM',
    standard: 'IEC TC57',
    format: 'XML',
    version: '17',
    source: 'IEC TC57 Working Group 14',
    url: 'https://cimug.ucaiug.org/',
    lastFetched: new Date(Date.now() - 86_400_000).toISOString(),
    linkedMappings: 1,
    status: 'linked'
  },
  {
    id: 'rsc-002',
    name: 'DALI-2/LuminaireStatus',
    catalogue: 'DALI Alliance',
    standard: 'IEC 62386',
    format: 'JSON',
    version: '2.0',
    source: 'DALI Alliance AG',
    url: 'https://www.dali-alliance.org/',
    lastFetched: new Date(Date.now() - 172_800_000).toISOString(),
    linkedMappings: 1,
    status: 'linked'
  },
  {
    id: 'rsc-003',
    name: 'SunSpec/Model101',
    catalogue: 'SunSpec Alliance',
    standard: 'SunSpec Information Models',
    format: 'JSON',
    version: '3.0',
    source: 'SunSpec Alliance',
    url: 'https://sunspec.org/',
    lastFetched: new Date(Date.now() - 259_200_000).toISOString(),
    linkedMappings: 1,
    status: 'outdated'
  },
  {
    id: 'rsc-004',
    name: 'OpenWeatherMap/Current',
    catalogue: 'OpenWeather API',
    standard: 'OWM REST API v3.0',
    format: 'JSON',
    version: '3.0',
    source: 'OpenWeather Ltd',
    url: 'https://openweathermap.org/api',
    lastFetched: new Date(Date.now() - 3_600_000).toISOString(),
    linkedMappings: 1,
    status: 'linked'
  },
  {
    id: 'rsc-005',
    name: 'ENTSO-E/DayAheadPrice',
    catalogue: 'ENTSO-E Transparency Platform',
    standard: 'ENTSO-E API',
    format: 'XML',
    version: '4.2',
    source: 'European Network of Transmission System Operators',
    url: 'https://transparency.entsoe.eu/',
    lastFetched: new Date(Date.now() - 3_600_000).toISOString(),
    linkedMappings: 0,
    status: 'unlinked'
  },
  {
    id: 'rsc-006',
    name: 'CityGML/StreetFurniture',
    catalogue: 'OGC CityGML',
    standard: 'OGC CityGML 3.0',
    format: 'JSON-LD',
    version: '3.0',
    source: 'Open Geospatial Consortium',
    url: 'https://www.ogc.org/standards/citygml',
    lastFetched: new Date(Date.now() - 604_800_000).toISOString(),
    linkedMappings: 0,
    status: 'unlinked'
  }
]

const columns = [
  { field: 'name', header: 'Schema Name', sortable: true },
  { field: 'catalogue', header: 'Linked Catalogue', sortable: true },
  { field: 'standard', header: 'Standard', sortable: true },
  { field: 'format', header: 'Format', sortable: true, width: '90px' },
  { field: 'version', header: 'Version', sortable: true, width: '90px' },
  { field: 'linkedMappings', header: 'Mappings', type: 'number' as const, sortable: true, width: '100px' },
  { field: 'status', header: 'Status', type: 'status' as const, sortable: true, width: '110px' },
  { field: 'lastFetched', header: 'Last Fetched', type: 'date' as const, sortable: true },
  { field: 'id', header: 'Actions', type: 'actions' as const, sortable: false, width: '120px' }
]

const filters = [
  { label: 'Linked', value: 'linked', field: 'status' },
  { label: 'Unlinked', value: 'unlinked', field: 'status' },
  { label: 'Outdated', value: 'outdated', field: 'status' },
  { label: 'JSON', value: 'JSON', field: 'format' },
  { label: 'XML', value: 'XML', field: 'format' }
]
</script>

<template>
  <div class="view-page">
    <PageHeader
      title="Remote Schemas"
      subtitle="External and third-party schemas integrated via protocol adapters"
      :breadcrumbs="[{ label: 'Schema & Mapping' }, { label: 'Remote Schemas' }]"
    >
    </PageHeader>

    <div class="view-body">
      <!-- Catalogue cards -->
      <div class="catalogues-grid">
        <div v-for="sch in remoteSchemas" :key="sch.id" class="catalogue-card">
          <div class="catalogue-card__header">
            <div class="cc-icon">
              <i class="pi pi-cloud"></i>
            </div>
            <div class="cc-status" :class="`cc-status--${sch.status}`">{{ sch.status }}</div>
          </div>
          <div class="cc-name">{{ sch.name }}</div>
          <div class="cc-catalogue">{{ sch.catalogue }}</div>
          <div class="cc-row">
            <span class="cc-label">Format</span>
            <span class="cc-format">{{ sch.format }}</span>
          </div>
          <div class="cc-row">
            <span class="cc-label">Version</span>
            <span>{{ sch.version }}</span>
          </div>
          <div class="cc-row">
            <span class="cc-label">Mappings</span>
            <span>{{ sch.linkedMappings }}</span>
          </div>
        </div>
      </div>

      <!-- Table view -->
      <DataTablePage
        title="Remote Schema Registry"
        subtitle="All external schemas registered with this platform"
        :columns="columns"
        :data="remoteSchemas as unknown as Record<string, unknown>[]"
        :filters="filters"
        :search-fields="['name', 'catalogue', 'standard', 'format']"
        empty-icon="pi-cloud"
        empty-title="No remote schemas"
      >
      </DataTablePage>
    </div>
  </div>
</template>

<style scoped>
.view-page { display: flex; flex-direction: column; }

.view-body {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.catalogues-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 1rem;
}

.catalogue-card {
  background: var(--facis-surface);
  border: 1px solid var(--facis-border);
  border-radius: var(--facis-radius);
  box-shadow: var(--facis-shadow);
  padding: 1rem 1.125rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  transition: box-shadow 0.15s;
}

.catalogue-card:hover {
  box-shadow: var(--facis-shadow-md);
}

.catalogue-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.cc-icon {
  width: 32px;
  height: 32px;
  background: var(--facis-primary-light);
  color: var(--facis-primary);
  border-radius: var(--facis-radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.9rem;
}

.cc-status {
  font-size: 0.714rem;
  font-weight: 600;
  padding: 0.15rem 0.5rem;
  border-radius: 20px;
}

.cc-status--linked    { background: #dcfce7; color: #15803d; }
.cc-status--unlinked  { background: var(--facis-surface-2); color: var(--facis-text-secondary); border: 1px solid var(--facis-border); }
.cc-status--outdated  { background: var(--facis-warning-light); color: #92400e; }

.cc-name {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--facis-text);
  line-height: 1.3;
}

.cc-catalogue {
  font-size: 0.714rem;
  color: var(--facis-text-secondary);
}

.cc-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.75rem;
}

.cc-label {
  color: var(--facis-text-muted);
}

.cc-format {
  font-family: var(--facis-font-mono);
  font-size: 0.7rem;
  background: var(--facis-primary-light);
  color: var(--facis-primary);
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
}
</style>
