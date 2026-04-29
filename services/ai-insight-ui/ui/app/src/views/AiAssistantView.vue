<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import SelectButton from 'primevue/selectbutton'
import PageHeader from '@/components/common/PageHeader.vue'
import KpiCard from '@/components/common/KpiCard.vue'
import TimeSeriesChart from '@/components/common/TimeSeriesChart.vue'
import { useInsightApi } from '@/composables/useInsightApi'
import { useUiBuilderStore } from '@/stores/uibuilder'
import {
  getMeters, getMeterCurrent,
  getPVSystems, getPVCurrent,
  getPriceCurrent, getPriceHistory
} from '@/services/api'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  promptKey?: string
  insightCard?: InsightCard
}

interface InsightCard {
  findings: string[]
  recommendations: string[]
}

// ─── State ────────────────────────────────────────────────────────────────────

const { askAi } = useInsightApi()
const uib = useUiBuilderStore()

// Live data from simulation API
const isLive = ref(false)
const liveTotalPowerKw = ref(0)
const livePvPowerKw = ref(0)
const livePricePerKwh = ref(0.12)
const liveMeterCount = ref(0)
const livePvRecords = ref<{ timestamp: string; pvPower_kW: number; irradiance_w_m2: number }[]>([])
const livePriceRecords = ref<{ timestamp: string; priceEurPerKwh: number }[]>([])

// Try to connect UIBUILDER on mount; gracefully falls back to demo mode
onMounted(async () => {
  await uib.init()

  // If connected, watch for live KPI pushes from Node-RED
  if (uib.connected) {
    const unsubscribe = uib.onMessage((msg) => {
      if (msg.topic === 'kpi.update' && uib.lastKpi) {
        // KPI state is already updated in the store; nothing extra needed here
      }
    })
    onUnmounted(unsubscribe)
  }

  // Fetch live simulation data for KPIs and charts
  try {
    const [metersResp, pvResp, priceResp] = await Promise.all([
      getMeters(), getPVSystems(), getPriceCurrent()
    ])

    if (metersResp && metersResp.count > 0) {
      liveMeterCount.value = metersResp.count
      // Fetch currents for all meters
      const currents = await Promise.all(
        metersResp.meters.slice(0, 5).map(m => getMeterCurrent(m.meter_id))
      )
      liveTotalPowerKw.value = currents.reduce((sum, c) => {
        if (!c) return sum
        return sum + (
          c.readings.active_power_l1_w +
          c.readings.active_power_l2_w +
          c.readings.active_power_l3_w
        ) / 1000
      }, 0)
    }

    if (pvResp && pvResp.count > 0) {
      const pvCurrent = await getPVCurrent(pvResp.systems[0].system_id)
      if (pvCurrent) livePvPowerKw.value = pvCurrent.readings.power_kw
    }

    if (priceResp) {
      livePricePerKwh.value = priceResp.current.price_eur_per_kwh
    }

    // Fetch price history for cost chart
    const priceHistResp = await getPriceHistory()
    if (priceHistResp) {
      livePriceRecords.value = priceHistResp.prices.map(p => ({
        timestamp: p.timestamp,
        priceEurPerKwh: p.price_eur_per_kwh
      }))
    }

    // Fetch PV history for forecast chart
    if (pvResp && pvResp.count > 0) {
      const { getPVHistory } = await import('@/services/api')
      const pvHist = await getPVHistory(pvResp.systems[0].system_id)
      if (pvHist) {
        livePvRecords.value = pvHist.readings.map(r => ({
          timestamp: r.timestamp,
          pvPower_kW: r.power_kw,
          irradiance_w_m2: r.irradiance_w_m2
        }))
      }
    }

    // Mark as live if ANY API data was successfully fetched
    if (metersResp || pvResp || priceResp) isLive.value = true
  } catch { /* API unreachable — stay in offline mode */ }
})

const messages = ref<Message[]>([
  {
    id: 'init',
    role: 'assistant',
    content: 'Hello! I am the FACIS AI Assistant. I can analyse energy consumption patterns, interpret IoT telemetry, explain anomalies, forecast PV output, and suggest cost optimisations. Select a quick prompt or ask me anything.',
    timestamp: new Date()
  }
])

const inputText = ref('')
const loading = ref(false)
const chatContainer = ref<HTMLDivElement | null>(null)
const chartPanelOpen = ref(false)
const activeChartTab = ref('forecast')

// ─── LLM Provider & Time Range ────────────────────────────────────────────────

const llmProvider = ref('gpt-4.1-mini')
const LLM_OPTIONS = [
  { label: 'GPT-4.1 Mini', value: 'gpt-4.1-mini' }
]

const timeRange = ref('24h')
const TIME_RANGE_OPTIONS = [
  { label: '24h', value: '24h' },
  { label: '7d', value: '7d' },
  { label: '30d', value: '30d' }
]

// ─── KPI Cards ────────────────────────────────────────────────────────────────

const kpis = computed(() => {
  const totalPower = Number(liveTotalPowerKw.value) || 0
  const pvPower = Number(livePvPowerKw.value) || 0
  const price = Number(livePricePerKwh.value) || 0.12
  const netGrid = Math.max(0, totalPower - pvPower)
  const dailyCost = netGrid * 24 * price

  return [
    { label: 'Net Grid Import', value: netGrid.toFixed(1), unit: 'kW', trend: 'stable' as const, icon: 'pi-arrow-down-left', color: '#3b82f6' },
    { label: 'PV Generation', value: pvPower.toFixed(1), unit: 'kW', trend: 'up' as const, trendValue: isLive.value ? 'Live' : '', icon: 'pi-sun', color: '#f59e0b' },
    { label: 'Daily Cost Est.', value: `€${dailyCost.toFixed(0)}`, unit: '', trend: 'down' as const, trendValue: isLive.value ? 'Live' : '', icon: 'pi-euro', color: '#22c55e' },
    { label: 'Anomalies (24h)', value: '--', unit: '', trend: 'stable' as const, icon: 'pi-exclamation-triangle', color: '#ef4444' }
  ]
})

// ─── Smart Prompt Buttons ─────────────────────────────────────────────────────

const smartPrompts = [
  { key: 'energy-summary', label: 'Energy Summary', icon: 'pi-bolt' },
  { key: 'pv-forecast', label: 'PV Forecast', icon: 'pi-sun' },
  { key: 'anomaly-report', label: 'Anomaly Check', icon: 'pi-exclamation-triangle' },
  { key: 'city-status', label: 'City Events', icon: 'pi-map-marker' },
  { key: 'cost-optimization', label: 'Cost Optimisation', icon: 'pi-chart-line' },
  { key: 'lighting-analysis', label: 'Lighting Analysis', icon: 'pi-lightbulb' }
]

// ─── Real Data Response Generator ────────────────────────────────────────────
// Computes responses from live simulation API data fetched on mount

async function generateLiveResponse(query: string): Promise<{ text: string; insightCard?: InsightCard }> {
  const power = Number(liveTotalPowerKw.value) || 0
  const pv = Number(livePvPowerKw.value) || 0
  const price = Number(livePricePerKwh.value) || 0
  const netGrid = Math.max(0, power - pv)
  const dailyCost = netGrid * 24 * price
  const selfSufficiency = power > 0 ? ((pv / power) * 100).toFixed(1) : '0'

  // Fetch fresh data for specific prompts
  const { getMeterHistory, getPriceForecast, getStreetlights, getStreetlightCurrent, getTrafficZones, getTrafficCurrent, getCityEvents, getCityEventCurrent, getCityWeatherCurrent } = await import('@/services/api')

  const q = query.toLowerCase()

  if (q.includes('energy') || q.includes('consumption') || q.includes('kw') || q.includes('meter') || q.includes('summary')) {
    const hist = await getMeterHistory('meter-001')
    const readings = hist?.readings ?? []
    const totalKwh = readings.reduce((s: number, r: any) => s + (r.readings?.active_power_l1_w + r.readings?.active_power_l2_w + r.readings?.active_power_l3_w || 0) / 1000 * 0.25, 0)
    const peak = readings.reduce((m: number, r: any) => Math.max(m, (r.readings?.active_power_l1_w + r.readings?.active_power_l2_w + r.readings?.active_power_l3_w || 0) / 1000), 0)
    return {
      text: `Based on the last 24 hours of live telemetry from **${liveMeterCount.value}** meter(s), total consumption was **${totalKwh.toFixed(0)} kWh** with PV generation contributing **${(pv * 24 * 0.6).toFixed(0)} kWh** (${selfSufficiency}% self-sufficiency). Current active power is **${power.toFixed(1)} kW**. Peak demand was **${peak.toFixed(1)} kW**. Current spot price: **€${price.toFixed(3)}/kWh**.`,
      insightCard: { findings: [`Live consumption: ${totalKwh.toFixed(0)} kWh over 24h`, `Current power: ${power.toFixed(1)} kW across ${liveMeterCount.value} meter(s)`, `Peak demand: ${peak.toFixed(1)} kW`, `PV self-sufficiency: ${selfSufficiency}%`, `Current spot price: €${price.toFixed(3)}/kWh`], recommendations: [`Net grid import is ${netGrid.toFixed(1)} kW — consider shifting loads to PV-peak hours`, `Estimated daily cost at current rate: €${dailyCost.toFixed(0)}`] }
    }
  }

  if (q.includes('pv') || q.includes('solar') || q.includes('forecast') || q.includes('irradiance')) {
    const forecast = await getPriceForecast()
    const fcPrices = forecast?.forecast ?? []
    return {
      text: `Current PV generation: **${pv.toFixed(1)} kW**. Based on the 24h price forecast (${fcPrices.length} data points), the optimal self-consumption window is during the highest-price hours. Current irradiance conditions suggest ${pv > 1 ? 'active generation' : 'low/no generation (nighttime or overcast)'}.\n\nPrice forecast range: **€${fcPrices.length > 0 ? Math.min(...fcPrices.map((p: any) => p.price_eur_per_kwh)).toFixed(3) : '?'}** to **€${fcPrices.length > 0 ? Math.max(...fcPrices.map((p: any) => p.price_eur_per_kwh)).toFixed(3) : '?'}/kWh**.`,
      insightCard: { findings: [`Current PV output: ${pv.toFixed(1)} kW`, `${fcPrices.length} forecast price points available`, `Price range: €${fcPrices.length > 0 ? Math.min(...fcPrices.map((p: any) => p.price_eur_per_kwh)).toFixed(3) : '?'} – €${fcPrices.length > 0 ? Math.max(...fcPrices.map((p: any) => p.price_eur_per_kwh)).toFixed(3) : '?'}/kWh`], recommendations: [`${pv > 1 ? 'Maximise self-consumption during current generation window' : 'PV not generating — schedule loads for next solar window'}`, `Monitor forecast for optimal battery charging times`] }
    }
  }

  if (q.includes('anomaly') || q.includes('anomali') || q.includes('spike') || q.includes('fault')) {
    const hist = await getMeterHistory('meter-001')
    const readings = hist?.readings ?? []
    const powers = readings.map((r: any) => ((r.readings?.active_power_l1_w ?? 0) + (r.readings?.active_power_l2_w ?? 0) + (r.readings?.active_power_l3_w ?? 0)) / 1000)
    const avg = powers.length > 0 ? powers.reduce((a: number, b: number) => a + b, 0) / powers.length : 0
    const std = powers.length > 0 ? Math.sqrt(powers.reduce((s: number, v: number) => s + (v - avg) ** 2, 0) / powers.length) : 0
    const anomalies = powers.filter((p: number) => Math.abs(p - avg) > 2 * std).length
    return {
      text: `Anomaly scan of **${readings.length}** readings from meter-001 over the last 24 hours:\n\nMean power: **${avg.toFixed(1)} kW**, Standard deviation: **${std.toFixed(2)} kW**.\n\n**${anomalies}** reading(s) exceed the 2σ threshold (±${(2 * std).toFixed(1)} kW from mean). ${anomalies === 0 ? 'No significant anomalies detected — system operating within normal parameters.' : `${anomalies} anomalous reading(s) detected — review the power history chart for details.`}`,
      insightCard: { findings: [`${readings.length} readings analysed from meter-001`, `Mean: ${avg.toFixed(1)} kW, Std Dev: ${std.toFixed(2)} kW`, `2σ threshold: ±${(2 * std).toFixed(1)} kW`, `Anomalies detected: ${anomalies}`], recommendations: anomalies > 0 ? ['Review power history chart for anomaly timestamps', 'Check device schedules during anomaly periods'] : ['No action required — all readings within normal range'] }
    }
  }

  if (q.includes('city') || q.includes('event')) {
    const zones = await getTrafficZones()
    const events = await getCityEvents()
    const weather = await getCityWeatherCurrent()
    const zoneCount = zones?.count ?? 0
    const eventCount = events?.count ?? 0
    const vis = weather?.visibility ?? 'unknown'
    const fog = Number(weather?.fog_index ?? 0).toFixed(1)
    const sunrise = weather?.sunrise_time ?? '--:--'
    const sunset = weather?.sunset_time ?? '--:--'
    return {
      text: `Smart City status: **${zoneCount}** traffic zone(s) monitored, **${eventCount}** event zone(s) active. Current visibility: **${vis}** (fog index: ${fog}%). Sunrise: ${sunrise}, Sunset: ${sunset}.`,
      insightCard: { findings: [`${zoneCount} traffic zones monitored`, `${eventCount} event zones`, `Visibility: ${vis} (fog: ${fog}%)`, `Sunrise: ${sunrise}, Sunset: ${sunset}`], recommendations: ['Monitor traffic zones for congestion patterns', 'Adjust lighting schedules based on sunrise/sunset times'] }
    }
  }

  if (q.includes('cost') || q.includes('saving') || q.includes('price') || q.includes('tariff') || q.includes('optimi')) {
    const forecast = await getPriceForecast()
    const fcPrices = forecast?.forecast ?? []
    const minPrice = fcPrices.length > 0 ? Math.min(...fcPrices.map((p: any) => p.price_eur_per_kwh)) : 0
    const maxPrice = fcPrices.length > 0 ? Math.max(...fcPrices.map((p: any) => p.price_eur_per_kwh)) : 0
    const savings = (maxPrice - minPrice) * netGrid * 24
    const cheapHours = fcPrices.filter((p: any) => p.price_eur_per_kwh < (minPrice + maxPrice) / 2).map((p: any) => new Date(p.timestamp).getHours()).slice(0, 4)
    return {
      text: `Analysing the ENTSO-E spot price forecast alongside your current load of **${netGrid.toFixed(1)} kW** net grid import:\n\n- Price range: **€${minPrice.toFixed(3)}/kWh** to **€${maxPrice.toFixed(3)}/kWh** (spread: €${(maxPrice - minPrice).toFixed(3)}/kWh)\n- Estimated savings from load shifting: **€${savings.toFixed(0)}/day**\n- Cheapest hours: **${cheapHours.map(h => `${h}:00`).join(', ')}**\n- Current rate: **€${price.toFixed(3)}/kWh** (${price > (minPrice + maxPrice) / 2 ? 'above average' : 'below average'})`,
      insightCard: { findings: [`Current price: €${price.toFixed(3)}/kWh`, `24h range: €${minPrice.toFixed(3)} – €${maxPrice.toFixed(3)}/kWh`, `Net grid import: ${netGrid.toFixed(1)} kW`, `Estimated daily cost: €${dailyCost.toFixed(0)}`], recommendations: [`Shift deferrable loads to ${cheapHours.map(h => `${h}:00`).join(', ')}`, `Potential savings: €${savings.toFixed(0)}/day from load shifting`, `Current rate is ${price > (minPrice + maxPrice) / 2 ? 'above' : 'below'} average — ${price > (minPrice + maxPrice) / 2 ? 'defer non-essential loads' : 'good time to run high-power equipment'}`] }
    }
  }

  if (q.includes('light') || q.includes('dali') || q.includes('luminar') || q.includes('dimm')) {
    const lights = await getStreetlights()
    const lightCount = lights?.count ?? 0
    const zones = new Set(lights?.streetlights?.map((l: any) => l.zone_id) ?? [])
    let totalPowerW = 0
    if (lights?.streetlights) {
      for (const l of lights.streetlights.slice(0, 10)) {
        const c = await getStreetlightCurrent(l.light_id)
        if (c) totalPowerW += c.power_w
      }
    }
    return {
      text: `Smart Lighting status: **${lightCount}** luminaire(s) across **${zones.size}** zone(s). Current total lighting power: **${(totalPowerW / 1000).toFixed(2)} kW** (${totalPowerW.toFixed(0)} W). Estimated 24h consumption at current levels: **${(totalPowerW / 1000 * 24).toFixed(1)} kWh**.`,
      insightCard: { findings: [`${lightCount} luminaires across ${zones.size} zones`, `Current power: ${totalPowerW.toFixed(0)} W (${(totalPowerW / 1000).toFixed(2)} kW)`, `Est. 24h consumption: ${(totalPowerW / 1000 * 24).toFixed(1)} kWh`], recommendations: [`Review dimming schedules for energy optimisation`, `Monitor zone-level efficiency ratios`] }
    }
  }

  // Generic response
  return {
    text: `Based on current platform telemetry: **${liveMeterCount.value}** meter(s) reporting, active power **${power.toFixed(1)} kW**, PV generation **${pv.toFixed(1)} kW**, current price **€${price.toFixed(3)}/kWh**. Net grid import: **${netGrid.toFixed(1)} kW**. Estimated daily cost: **€${dailyCost.toFixed(0)}**.\n\nAsk about energy consumption, PV forecasts, anomaly detection, cost optimisation, city events, or lighting analysis.`,
    insightCard: undefined
  }
}

// ─── Sending ──────────────────────────────────────────────────────────────────

// Tracks which smart prompt key triggered the current request (null = freeform)
let promptKeyRef: string | null = null

async function sendMessage(text?: string, promptKey?: string): Promise<void> {
  const query = (text ?? inputText.value).trim()
  if (!query || loading.value) return

  promptKeyRef = promptKey ?? null

  messages.value.push({
    id: Date.now().toString(),
    role: 'user',
    content: query,
    timestamp: new Date()
  })

  inputText.value = ''
  loading.value = true

  await nextTick()
  scrollToBottom()

  // Route through UIBUILDER if connected, otherwise use demo/HTTP fallback
  if (uib.isAvailable) {
    try {
      let answer: string
      if (promptKeyRef) {
        // Smart prompt: use structured insight.request topic
        const now = Date.now()
        answer = await uib.requestInsight(
          promptKeyRef,
          { start_ts: now - 86_400_000, end_ts: now },
          query
        )
      } else {
        // Free-form: use llm.freeform topic
        answer = await uib.requestLlm(query)
      }
      messages.value.push({
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: answer,
        timestamp: new Date()
      })
    } catch {
      const fallback = await generateLiveResponse(query)
      messages.value.push({
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: fallback.text,
        timestamp: new Date(),
        insightCard: fallback.insightCard
      })
    }
  } else {
    // ALL queries go through the AI Insight API (Trino + GPT-4.1-mini)
    const { postInsightEnergySummary, postInsightAnomalyReport, postInsightCityStatus } = await import('@/services/api')

    // Use the frontend time range filter
    const now = new Date()
    const rangeMs = timeRange.value === '30d' ? 30 * 86_400_000
                  : timeRange.value === '7d'  ? 7 * 86_400_000
                  : 86_400_000
    const startTs = new Date(now.getTime() - rangeMs).toISOString()
    const endTs = now.toISOString()

    let aiResult: any = null
    const q = query.toLowerCase()

    // Route to the appropriate AI Insight endpoint
    if (promptKeyRef === 'anomaly-report' || q.includes('anomaly') || q.includes('anomali') || q.includes('spike') || q.includes('fault')) {
      aiResult = await postInsightAnomalyReport(startTs, endTs)
    } else if (promptKeyRef === 'city-status' || promptKeyRef === 'lighting-analysis' || q.includes('city') || q.includes('event') || q.includes('lighting') || q.includes('zone') || q.includes('dali') || q.includes('luminar') || q.includes('dimm') || q.includes('traffic')) {
      aiResult = await postInsightCityStatus(startTs, endTs)
    } else {
      // Default: energy-summary covers energy, PV, cost, forecast, and general queries
      aiResult = await postInsightEnergySummary(startTs, endTs)
    }

    if (aiResult && aiResult.summary) {
      messages.value.push({
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: aiResult.summary,
        timestamp: new Date(),
        insightCard: {
          findings: aiResult.key_findings || [],
          recommendations: aiResult.recommendations || []
        }
      })
    } else {
      messages.value.push({
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'The AI Insight service did not return a response. The Trino Gold layer may not have data for the requested time window. Please try again.',
        timestamp: new Date()
      })
    }
  }

  loading.value = false
  await nextTick()
  scrollToBottom()
}

function useSmartPrompt(key: string): void {
  const prompt = smartPrompts.find(p => p.key === key)
  if (!prompt) return
  sendMessage(prompt.label, key)
}

function scrollToBottom(): void {
  if (chatContainer.value) {
    chatContainer.value.scrollTop = chatContainer.value.scrollHeight
  }
}

// ─── Markdown-ish renderer ────────────────────────────────────────────────────

function renderContent(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')
    .replace(/^/, '<p>')
    .replace(/$/, '</p>')
}

// ─── Charts ───────────────────────────────────────────────────────────────────

const chartLabels = computed(() => {
  const src = isLive.value && livePvRecords.value.length > 0 ? livePvRecords.value : []
  return src.slice(-24).map(r => {
    const h = new Date(r.timestamp).getHours()
    return `${String(h).padStart(2, '0')}:00`
  })
})

const forecastDatasets = computed(() => {
  const src = isLive.value && livePvRecords.value.length > 0 ? livePvRecords.value : []
  const slice = src.slice(-24)
  return [
    {
      label: 'PV Power (kW)',
      data: slice.map(r => Math.round(r.pvPower_kW * 10) / 10),
      borderColor: '#f59e0b',
      backgroundColor: 'rgba(245,158,11,0.1)',
      fill: true,
      tension: 0.4
    },
    {
      label: 'Irradiance (W/m² ÷10)',
      data: slice.map(r => Math.round(r.irradiance_w_m2 / 10) / 10),
      borderColor: '#fbbf24',
      tension: 0.4
    }
  ]
})

const costDatasets = computed(() => {
  const src = isLive.value && livePriceRecords.value.length > 0 ? livePriceRecords.value : []
  return [
    {
      label: 'Price (€/kWh)',
      data: src.map(r => Math.round(r.priceEurPerKwh * 1000) / 1000),
      borderColor: '#3b82f6',
      backgroundColor: 'rgba(59,130,246,0.07)',
      fill: true,
      tension: 0.4
    }
  ]
})

const costLabels = computed(() => {
  const src = isLive.value && livePriceRecords.value.length > 0 ? livePriceRecords.value : []
  return src.map(r => {
    const h = new Date(r.timestamp).getHours()
    return `${String(h).padStart(2, '0')}:00`
  })
})
</script>

<template>
  <div class="assistant-page">
    <PageHeader
      title="AI Assistant"
      subtitle="Natural language interface to platform data, insights, and optimisation recommendations"
      :breadcrumbs="[{ label: 'AI Assistant' }]"
    />

    <div class="assistant-body">
      <!-- Left: Chat panel -->
      <div class="chat-panel">
        <!-- Controls bar -->
        <div class="chat-controls">
          <div class="cc-left">
            <Select
              v-model="llmProvider"
              :options="LLM_OPTIONS"
              option-label="label"
              option-value="value"
              size="small"
              class="llm-select"
            />
            <SelectButton
              v-model="timeRange"
              :options="TIME_RANGE_OPTIONS"
              option-label="label"
              option-value="value"
              size="small"
            />
            <!-- Connection status -->
            <span class="uib-status" :class="isLive ? 'uib-status--live' : 'uib-status--demo'">
              <span class="uib-status__dot"></span>
              {{ isLive ? 'Live Data' : uib.connected ? 'Live (Node-RED)' : 'Simulation API' }}
            </span>
          </div>
          <Button
            :icon="chartPanelOpen ? 'pi pi-chevron-right' : 'pi pi-chart-bar'"
            :label="chartPanelOpen ? 'Hide Charts' : 'Show Charts'"
            text
            size="small"
            @click="chartPanelOpen = !chartPanelOpen"
          />
        </div>

        <!-- KPI mini-bar -->
        <div class="chat-kpis">
          <div v-for="kpi in kpis" :key="kpi.label" class="ck-item">
            <span class="ck-value">{{ kpi.value }} <span class="ck-unit">{{ kpi.unit }}</span></span>
            <span class="ck-label">{{ kpi.label }}</span>
          </div>
        </div>

        <!-- Smart prompts -->
        <div class="smart-prompts">
          <button
            v-for="prompt in smartPrompts"
            :key="prompt.key"
            class="prompt-btn"
            :disabled="loading"
            @click="useSmartPrompt(prompt.key)"
          >
            <i :class="`pi ${prompt.icon}`"></i>
            {{ prompt.label }}
          </button>
        </div>

        <!-- Messages -->
        <div ref="chatContainer" class="chat-messages">
          <div
            v-for="msg in messages"
            :key="msg.id"
            class="chat-message"
            :class="`chat-message--${msg.role}`"
          >
            <div class="chat-message__avatar">
              <i :class="msg.role === 'user' ? 'pi pi-user' : 'pi pi-sparkles'"></i>
            </div>
            <div class="chat-message__wrap">
              <div
                class="chat-message__bubble"
                :class="{ 'chat-message__bubble--user': msg.role === 'user' }"
              >
                <!-- eslint-disable-next-line vue/no-v-html -->
                <div v-if="msg.role === 'assistant'" class="chat-message__content" v-html="renderContent(msg.content)"></div>
                <div v-else class="chat-message__content">{{ msg.content }}</div>

                <!-- Insight card -->
                <div v-if="msg.insightCard" class="insight-card">
                  <div class="ic-section ic-section--findings">
                    <div class="ic-title">
                      <i class="pi pi-search"></i> Findings
                    </div>
                    <ul class="ic-list">
                      <li v-for="finding in msg.insightCard.findings" :key="finding">{{ finding }}</li>
                    </ul>
                  </div>
                  <div class="ic-section ic-section--recs">
                    <div class="ic-title">
                      <i class="pi pi-lightbulb"></i> Recommendations
                    </div>
                    <ul class="ic-list">
                      <li v-for="rec in msg.insightCard.recommendations" :key="rec">{{ rec }}</li>
                    </ul>
                  </div>
                </div>

                <div class="chat-message__time">
                  {{ msg.timestamp.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) }}
                </div>
              </div>
            </div>
          </div>

          <!-- Typing indicator -->
          <div v-if="loading" class="chat-message chat-message--assistant">
            <div class="chat-message__avatar typing-avatar">
              <i class="pi pi-sparkles"></i>
            </div>
            <div class="chat-message__wrap">
              <div class="chat-message__bubble typing-bubble">
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
              </div>
            </div>
          </div>
        </div>

        <!-- Input row -->
        <div class="chat-input-row">
          <InputText
            v-model="inputText"
            placeholder="Ask about your IoT data, anomalies, cost optimisations, or forecasts..."
            class="chat-input"
            :disabled="loading"
            @keyup.enter="sendMessage()"
          />
          <Button
            icon="pi pi-send"
            :disabled="!inputText.trim() || loading"
            :loading="loading"
            @click="sendMessage()"
          />
        </div>
      </div>

      <!-- Right: Chart panel -->
      <Transition name="slide-right">
        <div v-if="chartPanelOpen" class="chart-panel">
          <div class="chart-panel__tabs">
            <button
              v-for="tab in [{ key: 'forecast', label: '24h Forecast', icon: 'pi-sun' }, { key: 'cost', label: 'Cost Trend', icon: 'pi-euro' }, { key: 'kpis', label: 'KPIs', icon: 'pi-chart-bar' }]"
              :key="tab.key"
              class="cpt-btn"
              :class="{ 'cpt-btn--active': activeChartTab === tab.key }"
              @click="activeChartTab = tab.key"
            >
              <i :class="`pi ${tab.icon}`"></i>
              {{ tab.label }}
            </button>
          </div>

          <div class="chart-panel__content">
            <template v-if="activeChartTab === 'forecast'">
              <div class="cp-title">PV Generation — Last 24h</div>
              <TimeSeriesChart
                :datasets="forecastDatasets"
                :labels="chartLabels"
                y-axis-label="kW"
                :height="220"
              />
            </template>

            <template v-else-if="activeChartTab === 'cost'">
              <div class="cp-title">Spot Price — Last 24h</div>
              <TimeSeriesChart
                :datasets="costDatasets"
                :labels="costLabels"
                y-axis-label="€/kWh"
                :height="220"
              />
            </template>

            <template v-else-if="activeChartTab === 'kpis'">
              <div class="cp-title">Current Platform KPIs</div>
              <div class="kpi-mini-grid">
                <KpiCard
                  v-for="kpi in kpis"
                  :key="kpi.label"
                  :label="kpi.label"
                  :value="kpi.value"
                  :unit="kpi.unit"
                  :trend="kpi.trend"
                  :trend-value="kpi.trendValue"
                  :icon="kpi.icon"
                  :color="kpi.color"
                />
              </div>
            </template>
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.assistant-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.assistant-body {
  flex: 1;
  display: flex;
  gap: 1.5rem;
  padding: 1.5rem;
  overflow: hidden;
  min-height: 0;
}

/* ─── Chat Panel ─────────────────────────────────────────────────────────── */

.chat-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--facis-surface);
  border: 1px solid var(--facis-border);
  border-radius: var(--facis-radius);
  box-shadow: var(--facis-shadow);
  overflow: hidden;
  min-height: 0;
}

.chat-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1.25rem;
  border-bottom: 1px solid var(--facis-border);
  background: var(--facis-surface-2);
  gap: 1rem;
}

.cc-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.llm-select {
  min-width: 180px;
}

/* KPI mini bar */
.chat-kpis {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--facis-border);
  overflow-x: auto;
}

.ck-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.625rem 0.75rem;
  border-right: 1px solid var(--facis-border);
  min-width: 110px;
}

.ck-item:last-child { border-right: none; }

.ck-value {
  font-size: 1rem;
  font-weight: 700;
  color: var(--facis-text);
  line-height: 1.2;
}

.ck-unit {
  font-size: 0.75rem;
  font-weight: 400;
  color: var(--facis-text-secondary);
}

.ck-label {
  font-size: 0.7rem;
  color: var(--facis-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.03em;
  text-align: center;
}

/* Smart prompts */
.smart-prompts {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  padding: 0.75rem 1.25rem;
  border-bottom: 1px solid var(--facis-border);
}

.prompt-btn {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.786rem;
  font-weight: 500;
  padding: 0.35rem 0.875rem;
  border-radius: 20px;
  border: 1px solid var(--facis-border);
  background: var(--facis-surface);
  color: var(--facis-text-secondary);
  cursor: pointer;
  transition: all 0.12s;
  white-space: nowrap;
}

.prompt-btn:hover:not(:disabled) {
  border-color: var(--facis-primary);
  color: var(--facis-primary);
  background: var(--facis-primary-light);
}

.prompt-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.prompt-btn .pi {
  font-size: 0.75rem;
}

/* Messages */
.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-height: 0;
}

.chat-message {
  display: flex;
  gap: 0.75rem;
  max-width: 85%;
}

.chat-message--user {
  flex-direction: row-reverse;
  align-self: flex-end;
}

.chat-message--assistant {
  align-self: flex-start;
}

.chat-message__avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.875rem;
  flex-shrink: 0;
  margin-top: 0.2rem;
}

.chat-message--assistant .chat-message__avatar {
  background: var(--facis-primary-light);
  color: var(--facis-primary);
}

.chat-message--user .chat-message__avatar {
  background: var(--facis-surface-2);
  color: var(--facis-text-secondary);
}

.chat-message__wrap {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  flex: 1;
}

.chat-message__bubble {
  background: var(--facis-surface-2);
  border-radius: var(--facis-radius);
  padding: 0.875rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.chat-message__bubble--user {
  background: var(--facis-primary);
}

.chat-message__content {
  font-size: 0.875rem;
  line-height: 1.65;
  color: var(--facis-text);
}

.chat-message__bubble--user .chat-message__content {
  color: #fff;
}

.chat-message__content :deep(p) {
  margin: 0 0 0.5rem;
}

.chat-message__content :deep(p:last-child) {
  margin-bottom: 0;
}

.chat-message__content :deep(strong) {
  font-weight: 700;
}

.chat-message__time {
  font-size: 0.7rem;
  opacity: 0.55;
  align-self: flex-end;
}

/* Insight card */
.insight-card {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  border-radius: var(--facis-radius-sm);
  overflow: hidden;
}

.ic-section {
  padding: 0.75rem 0.875rem;
  border-radius: var(--facis-radius-sm);
}

.ic-section--findings { background: #f8fafc; border: 1px solid var(--facis-border); }
.ic-section--recs     { background: #f0fdf4; border: 1px solid #bbf7d0; }

.ic-title {
  font-size: 0.786rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--facis-text-secondary);
  margin-bottom: 0.5rem;
  display: flex;
  align-items: center;
  gap: 0.3rem;
}

.ic-section--recs .ic-title { color: #15803d; }

.ic-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  padding: 0;
}

.ic-list li {
  font-size: 0.8rem;
  color: var(--facis-text);
  padding-left: 1rem;
  position: relative;
  line-height: 1.4;
}

.ic-list li::before {
  content: '•';
  position: absolute;
  left: 0;
  color: var(--facis-text-muted);
}

.ic-section--recs .ic-list li::before { color: #15803d; }

/* Typing */
.typing-avatar { animation: pulse 2s infinite; }

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.typing-bubble {
  display: flex;
  flex-direction: row !important;
  align-items: center;
  gap: 0.4rem;
  padding: 0.75rem 1rem !important;
  width: fit-content;
}

.typing-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--facis-text-muted);
  animation: typing-bounce 1.2s infinite ease-in-out;
}

.typing-dot:nth-child(2) { animation-delay: 0.2s; }
.typing-dot:nth-child(3) { animation-delay: 0.4s; }

@keyframes typing-bounce {
  0%, 80%, 100% { transform: scale(1); opacity: 0.5; }
  40% { transform: scale(1.3); opacity: 1; }
}

/* Input */
.chat-input-row {
  display: flex;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  border-top: 1px solid var(--facis-border);
}

.chat-input { flex: 1; }

/* ─── Chart Panel ─────────────────────────────────────────────────────────── */

.chart-panel {
  width: 380px;
  flex-shrink: 0;
  background: var(--facis-surface);
  border: 1px solid var(--facis-border);
  border-radius: var(--facis-radius);
  box-shadow: var(--facis-shadow);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.chart-panel__tabs {
  display: flex;
  border-bottom: 1px solid var(--facis-border);
  background: var(--facis-surface-2);
}

.cpt-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  padding: 0.625rem 0.5rem;
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--facis-text-secondary);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: all 0.12s;
  white-space: nowrap;
}

.cpt-btn:hover { color: var(--facis-primary); }

.cpt-btn--active {
  color: var(--facis-primary);
  border-bottom-color: var(--facis-primary);
  background: var(--facis-surface);
}

.chart-panel__content {
  flex: 1;
  padding: 1.25rem;
  overflow-y: auto;
}

.cp-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--facis-text);
  margin-bottom: 1rem;
}

.kpi-mini-grid {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

/* Transition */
.slide-right-enter-active { transition: all 0.25s ease; }
.slide-right-leave-active { transition: all 0.2s ease; }
.slide-right-enter-from,
.slide-right-leave-to {
  opacity: 0;
  transform: translateX(20px);
}

/* UIBuilder connection status badge */
.uib-status {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.72rem;
  font-weight: 500;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  white-space: nowrap;
}

.uib-status--live {
  background: rgba(34, 197, 94, 0.12);
  color: #16a34a;
}

.uib-status--demo {
  background: rgba(245, 158, 11, 0.12);
  color: #b45309;
}

.uib-status__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.uib-status--live .uib-status__dot {
  background: #22c55e;
  box-shadow: 0 0 0 2px rgba(34,197,94,0.3);
  animation: pulse-green 2s infinite;
}

.uib-status--demo .uib-status__dot {
  background: #f59e0b;
}

@keyframes pulse-green {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
</style>
