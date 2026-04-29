<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import Button from 'primevue/button'
import PageHeader from '@/components/common/PageHeader.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import { getMeters, getPVSystems, getWeatherStations, getLoads, getStreetlights, getTrafficZones, getCityEvents } from '@/services/api'

const loading = ref(true)
const isLive  = ref(false)

interface SourceTypeCard {
  type: string
  icon: string
  color: string
  count: number
  protocol: string
  useCases: string[]
  ids: string[]
  healthStatus: 'healthy' | 'warning' | 'error'
}

const typeCards = ref<SourceTypeCard[]>([])
const selectedCard = ref<SourceTypeCard | null>(null)
const showingSources = ref(false)

async function fetchData(): Promise<void> {
  loading.value = true
  try {
    const [metersRes, pvRes, weatherRes, loadsRes, lightsRes, trafficRes, eventsRes] = await Promise.all([
      getMeters(), getPVSystems(), getWeatherStations(), getLoads(), getStreetlights(), getTrafficZones(), getCityEvents()
    ])

    const cards: SourceTypeCard[] = []

    if (metersRes?.meters?.length) {
      cards.push({
        type: 'Energy Meter', icon: 'pi-bolt', color: '#005fff',
        count: metersRes.count,
        protocol: 'MQTT/JSON, Modbus TCP',
        useCases: ['Smart Energy'],
        ids: metersRes.meters.map(m => m.meter_id),
        healthStatus: 'healthy'
      })
    }

    if (pvRes?.systems?.length) {
      cards.push({
        type: 'PV Inverter', icon: 'pi-sun', color: '#f59e0b',
        count: pvRes.count,
        protocol: 'SunSpec/Modbus',
        useCases: ['Smart Energy'],
        ids: pvRes.systems.map(s => s.system_id),
        healthStatus: 'healthy'
      })
    }

    if (weatherRes?.stations?.length) {
      cards.push({
        type: 'Weather Sensor', icon: 'pi-cloud', color: '#06b6d4',
        count: weatherRes.count,
        protocol: 'MQTT/JSON',
        useCases: ['Smart Energy', 'Smart City'],
        ids: weatherRes.stations.map(s => s.station_id),
        healthStatus: 'healthy'
      })
    }

    if (loadsRes?.devices?.length) {
      cards.push({
        type: 'Flexible Load', icon: 'pi-microchip', color: '#8b5cf6',
        count: loadsRes.count,
        protocol: 'MQTT/JSON',
        useCases: ['Smart Energy'],
        ids: loadsRes.devices.map(d => d.device_id),
        healthStatus: 'healthy'
      })
    }

    if (lightsRes?.streetlights?.length) {
      cards.push({
        type: 'Streetlight Controller', icon: 'pi-lightbulb', color: '#f59e0b',
        count: lightsRes.count,
        protocol: 'DLMS/COSEM, MQTT',
        useCases: ['Smart City'],
        ids: [...new Set(lightsRes.streetlights.map(l => l.zone_id))],
        healthStatus: 'healthy'
      })
    }

    if (trafficRes?.zones?.length) {
      cards.push({
        type: 'Traffic Feed', icon: 'pi-car', color: '#64748b',
        count: trafficRes.count,
        protocol: 'REST/JSON',
        useCases: ['Smart City'],
        ids: trafficRes.zones.map(z => z.zone_id),
        healthStatus: 'healthy'
      })
    }

    if (eventsRes?.zones?.length) {
      cards.push({
        type: 'City Event Feed', icon: 'pi-bell', color: '#ef4444',
        count: eventsRes.count,
        protocol: 'MQTT/JSON',
        useCases: ['Smart City'],
        ids: eventsRes.zones.map(z => z.zone_id),
        healthStatus: 'healthy'
      })
    }

    // Market price — always 1
    cards.push({
      type: 'Market Data', icon: 'pi-chart-line', color: '#8b5cf6',
      count: 1, protocol: 'REST/XML',
      useCases: ['Smart Energy'],
      ids: ['ENTSOE-price-feed'],
      healthStatus: 'healthy'
    })

    typeCards.value = cards.sort((a, b) => b.count - a.count)
    isLive.value = true
  } catch {
    typeCards.value = []
  } finally {
    loading.value = false
  }
}

onMounted(() => fetchData())

function viewSources(card: SourceTypeCard): void {
  selectedCard.value = card
  showingSources.value = true
}
</script>

<template>
  <div class="view-page">
    <PageHeader
      title="Source Types"
      subtitle="Data sources grouped by device and sensor category — derived from live API inventory"
      :breadcrumbs="[{ label: 'Data Sources' }, { label: 'Types' }]"
    />

    <div v-if="isLive" class="live-banner">
      <span class="live-dot"></span> Source type inventory derived from live simulation API
    </div>

    <div class="view-body">
      <div v-if="loading" class="loading-state">
        <i class="pi pi-spin pi-spinner" style="font-size:1.5rem;color:var(--facis-primary)"></i>
        <span>Discovering source types from live API…</span>
      </div>

      <template v-else>
        <div class="type-grid">
          <div
            v-for="card in typeCards"
            :key="card.type"
            class="type-card"
          >
            <div class="type-card__header">
              <div class="type-card__icon" :style="{ background: card.color + '18', color: card.color }">
                <i :class="`pi ${card.icon}`"></i>
              </div>
              <StatusBadge :status="card.healthStatus" size="sm" />
            </div>
            <div class="type-card__body">
              <div class="type-card__name">{{ card.type }}</div>
              <div class="type-card__count">
                <span class="count-number">{{ card.count }}</span>
                <span class="count-label">{{ card.count === 1 ? 'source' : 'sources' }}</span>
              </div>
              <div class="type-card__health">
                <span class="health-pill health-pill--ok"><i class="pi pi-check"></i> {{ card.count }}</span>
              </div>
              <div class="type-card__meta">
                <div class="meta-row">
                  <span class="meta-key">Use Cases</span>
                  <div class="meta-tags">
                    <span v-for="uc in card.useCases" :key="uc" class="meta-tag">{{ uc }}</span>
                  </div>
                </div>
                <div class="meta-row">
                  <span class="meta-key">Protocol</span>
                  <span class="meta-value">{{ card.protocol }}</span>
                </div>
              </div>
            </div>
            <div class="type-card__footer">
              <Button label="View Sources" icon="pi pi-arrow-right" icon-pos="right" size="small" text :style="{ color: card.color }" @click="viewSources(card)" />
            </div>
          </div>
        </div>

        <Transition name="slide-in">
          <div v-if="showingSources && selectedCard" class="sources-panel card">
            <div class="panel-header">
              <div class="panel-title-group">
                <div class="panel-icon" :style="{ background: selectedCard.color + '18', color: selectedCard.color }">
                  <i :class="`pi ${selectedCard.icon}`"></i>
                </div>
                <div>
                  <div class="panel-title">{{ selectedCard.type }}</div>
                  <div class="panel-subtitle">{{ selectedCard.count }} sources registered · Protocol: {{ selectedCard.protocol }}</div>
                </div>
              </div>
              <Button icon="pi pi-times" text size="small" @click="showingSources = false" />
            </div>
            <div class="panel-list">
              <div v-for="id in selectedCard.ids.slice(0, 12)" :key="id" class="panel-row">
                <StatusBadge status="healthy" size="sm" />
                <div class="panel-row__info">
                  <span class="panel-row__name">{{ id }}</span>
                  <span class="panel-row__meta">{{ selectedCard.protocol }} · {{ selectedCard.useCases.join(', ') }}</span>
                </div>
              </div>
              <div v-if="selectedCard.ids.length > 12" class="panel-row panel-row--more">
                <span>+{{ selectedCard.ids.length - 12 }} more sources not shown</span>
              </div>
            </div>
          </div>
        </Transition>
      </template>
    </div>
  </div>
</template>

<style scoped>
.live-banner { display: flex; align-items: center; gap: 0.5rem; font-size: 0.75rem; font-weight: 600; color: #15803d; background: #dcfce7; padding: 0.375rem 1.5rem; border-bottom: 1px solid #bbf7d0; }
.live-dot { width: 7px; height: 7px; border-radius: 50%; background: #22c55e; animation: pulse 1.5s infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
.loading-state { display: flex; align-items: center; justify-content: center; gap: 0.75rem; padding: 4rem; color: var(--facis-text-secondary); font-size: 0.875rem; }
.view-page { display: flex; flex-direction: column; }
.view-body { padding: 1.5rem; display: flex; flex-direction: column; gap: 1.5rem; }
.type-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 1rem; }
.type-card { background: var(--facis-surface); border: 1px solid var(--facis-border); border-radius: var(--facis-radius); box-shadow: var(--facis-shadow); display: flex; flex-direction: column; overflow: hidden; transition: box-shadow 0.15s; }
.type-card:hover { box-shadow: var(--facis-shadow-md); }
.type-card__header { display: flex; align-items: center; justify-content: space-between; padding: 1rem 1rem 0.5rem; }
.type-card__icon { width: 42px; height: 42px; border-radius: var(--facis-radius-sm); display: flex; align-items: center; justify-content: center; font-size: 1.15rem; }
.type-card__body { padding: 0 1rem 0.75rem; display: flex; flex-direction: column; gap: 0.625rem; flex: 1; }
.type-card__name { font-size: 0.95rem; font-weight: 600; color: var(--facis-text); }
.type-card__count { display: flex; align-items: baseline; gap: 0.3rem; }
.count-number { font-size: 2rem; font-weight: 700; color: var(--facis-text); line-height: 1; letter-spacing: -0.02em; }
.count-label { font-size: 0.8rem; color: var(--facis-text-secondary); font-weight: 500; }
.type-card__health { display: flex; gap: 0.375rem; }
.health-pill { display: inline-flex; align-items: center; gap: 0.25rem; font-size: 0.72rem; font-weight: 600; padding: 0.15rem 0.5rem; border-radius: 20px; }
.health-pill--ok { background: var(--facis-success-light); color: #15803d; }
.type-card__meta { display: flex; flex-direction: column; gap: 0.35rem; }
.meta-row { display: flex; align-items: flex-start; gap: 0.5rem; font-size: 0.75rem; }
.meta-key { font-weight: 500; color: var(--facis-text-secondary); min-width: 70px; flex-shrink: 0; }
.meta-value { color: var(--facis-text); }
.meta-tags { display: flex; gap: 0.25rem; flex-wrap: wrap; }
.meta-tag { font-size: 0.7rem; padding: 0.1rem 0.4rem; border-radius: 3px; background: var(--facis-primary-light); color: var(--facis-primary); font-weight: 600; }
.type-card__footer { padding: 0.5rem; border-top: 1px solid var(--facis-border); }
.sources-panel { overflow: hidden; }
.panel-header { display: flex; align-items: center; justify-content: space-between; padding: 1rem 1.25rem; border-bottom: 1px solid var(--facis-border); }
.panel-title-group { display: flex; align-items: center; gap: 0.875rem; }
.panel-icon { width: 36px; height: 36px; border-radius: var(--facis-radius-sm); display: flex; align-items: center; justify-content: center; font-size: 1rem; }
.panel-title { font-size: 0.95rem; font-weight: 600; color: var(--facis-text); }
.panel-subtitle { font-size: 0.75rem; color: var(--facis-text-secondary); }
.panel-list { display: flex; flex-direction: column; }
.panel-row { display: flex; align-items: center; gap: 1rem; padding: 0.75rem 1.25rem; border-bottom: 1px solid var(--facis-border); }
.panel-row:last-child { border-bottom: none; }
.panel-row--more { font-size: 0.8rem; color: var(--facis-text-muted); font-style: italic; }
.panel-row__info { flex: 1; display: flex; flex-direction: column; gap: 0.1rem; }
.panel-row__name { font-size: 0.875rem; font-weight: 500; color: var(--facis-text); font-family: var(--facis-font-mono); }
.panel-row__meta { font-size: 0.75rem; color: var(--facis-text-secondary); }
.slide-in-enter-active { transition: opacity 0.2s, transform 0.2s; }
.slide-in-enter-from { opacity: 0; transform: translateY(-8px); }
</style>
