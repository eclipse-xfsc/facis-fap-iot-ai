/**
 * FACIS Client-Side Analytics Engine
 *
 * Computes insights from raw simulation telemetry without requiring Trino or a data lake.
 * All functions are pure — no side effects, no API calls.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Anomaly {
  id: string
  timestamp: string
  meterId: string
  metric: string
  value: number
  mean: number
  stddev: number
  deviation: number   // sigma multiplier
  severity: 'critical' | 'warning' | 'info'
  explanation: string
  useCase: 'Smart Energy' | 'Smart City'
}

export interface CorrelationResult {
  r: number
  strength: 'strong' | 'moderate' | 'weak'
  direction: 'positive' | 'negative' | 'none'
  label: string
}

export interface Recommendation {
  id: string
  title: string
  summary: string
  explanation: string
  affectedObject: string
  estimatedImpact: string
  category: 'cost_saving' | 'efficiency' | 'maintenance' | 'safety'
  priority: 'high' | 'medium' | 'low'
  confidence: number
  useCase: 'Smart Energy' | 'Smart City' | 'Cross-Domain'
  advisoryNote: string
  createdAt: string
}

export interface TrendResult {
  min: number
  max: number
  avg: number
  trend: 'up' | 'down' | 'stable'
  trendPct: number
  labels: string[]
  values: number[]
}

// ─── Statistical helpers ──────────────────────────────────────────────────────

function mean(arr: number[]): number {
  if (!arr.length) return 0
  return arr.reduce((s, v) => s + v, 0) / arr.length
}

function stddev(arr: number[], mu?: number): number {
  if (arr.length < 2) return 0
  const m = mu ?? mean(arr)
  const variance = arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length
  return Math.sqrt(variance)
}

function pearsonR(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length)
  if (n < 2) return 0
  const mx = mean(xs.slice(0, n))
  const my = mean(ys.slice(0, n))
  let num = 0, dx2 = 0, dy2 = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx
    const dy = ys[i] - my
    num  += dx * dy
    dx2  += dx * dx
    dy2  += dy * dy
  }
  const denom = Math.sqrt(dx2 * dy2)
  return denom === 0 ? 0 : num / denom
}

// ─── Anomaly Detection ────────────────────────────────────────────────────────

/**
 * Detect statistical anomalies in a list of readings.
 * Any reading with power > 2σ above the mean is flagged.
 */
export function detectAnomalies(
  readings: Array<{ timestamp: string; [key: string]: unknown }>,
  meterId: string,
  metric: string = 'active_power_kw',
  useCase: 'Smart Energy' | 'Smart City' = 'Smart Energy'
): Anomaly[] {
  const values = readings.map(r => {
    const v = (r as Record<string, unknown>)[metric]
    if (typeof v === 'number') return v
    // Sum the three phases for W metrics
    const r2 = r as Record<string, unknown>
    if (metric === 'active_power_kw') {
      const l1 = (r2['active_power_l1_w'] as number ?? 0)
      const l2 = (r2['active_power_l2_w'] as number ?? 0)
      const l3 = (r2['active_power_l3_w'] as number ?? 0)
      return (l1 + l2 + l3) / 1000
    }
    return 0
  })

  const mu = mean(values)
  const sd = stddev(values, mu)
  if (sd === 0) return []

  const anomalies: Anomaly[] = []

  readings.forEach((r, i) => {
    const v = values[i]
    const deviation = sd > 0 ? (v - mu) / sd : 0
    if (Math.abs(deviation) >= 2) {
      const severity: Anomaly['severity'] = Math.abs(deviation) >= 3 ? 'critical' : Math.abs(deviation) >= 2.5 ? 'warning' : 'info'
      anomalies.push({
        id: `anom-${meterId}-${i}`,
        timestamp: r.timestamp as string,
        meterId,
        metric,
        value: Math.round(v * 100) / 100,
        mean: Math.round(mu * 100) / 100,
        stddev: Math.round(sd * 100) / 100,
        deviation: Math.round(deviation * 10) / 10,
        severity,
        explanation: `${meterId} reading of ${v.toFixed(2)} kW deviates ${Math.abs(deviation).toFixed(1)}σ from the 24h mean of ${mu.toFixed(2)} kW`,
        useCase
      })
    }
  })

  return anomalies
}

/**
 * Detect anomalies from streetlight power readings (Smart City).
 */
export function detectStreetlightAnomalies(
  readings: Array<{ timestamp: string; power_w: number; dimming_level_pct: number }>,
  lightId: string
): Anomaly[] {
  const values = readings.map(r => r.power_w)
  const mu = mean(values)
  const sd = stddev(values, mu)
  if (sd === 0) return []

  return readings.flatMap((r, i) => {
    const deviation = (r.power_w - mu) / sd
    if (Math.abs(deviation) < 2) return []
    return [{
      id: `anom-sl-${lightId}-${i}`,
      timestamp: r.timestamp,
      meterId: lightId,
      metric: 'power_w',
      value: r.power_w,
      mean: Math.round(mu * 10) / 10,
      stddev: Math.round(sd * 10) / 10,
      deviation: Math.round(deviation * 10) / 10,
      severity: (Math.abs(deviation) >= 3 ? 'critical' : 'warning') as Anomaly['severity'],
      explanation: `${lightId} power of ${r.power_w}W deviates ${Math.abs(deviation).toFixed(1)}σ from mean ${mu.toFixed(0)}W at dimming ${r.dimming_level_pct}%`,
      useCase: 'Smart City' as const
    }]
  })
}

// ─── Correlations ─────────────────────────────────────────────────────────────

/**
 * Compute Pearson correlation between two numeric series.
 */
export function computeCorrelations(dataset1: number[], dataset2: number[], label: string = ''): CorrelationResult {
  const r = pearsonR(dataset1, dataset2)
  const abs = Math.abs(r)
  const strength: CorrelationResult['strength'] = abs >= 0.8 ? 'strong' : abs >= 0.6 ? 'moderate' : 'weak'
  const direction: CorrelationResult['direction'] = abs < 0.1 ? 'none' : r > 0 ? 'positive' : 'negative'
  return { r: Math.round(r * 1000) / 1000, strength, direction, label }
}

// ─── Recommendations ──────────────────────────────────────────────────────────

/**
 * Generate cost-optimisation recommendations from live price, meter, and PV data.
 */
export function generateRecommendations(
  prices: Array<{ timestamp: string; price_eur_per_kwh: number; tariff_type: string }>,
  meterHistory: Array<{ timestamp: string; [key: string]: unknown }>,
  pvHistory: Array<{ timestamp: string; power_kw: number }>
): Recommendation[] {
  const recs: Recommendation[] = []
  const now = new Date().toISOString()

  // ── 1. Off-peak load shifting ──────────────────────────────────────────────
  const offPeakPrices = prices.filter(p => p.tariff_type === 'off-peak' || p.price_eur_per_kwh < 0.08)
  const peakPrices    = prices.filter(p => p.tariff_type === 'peak'     || p.price_eur_per_kwh > 0.14)
  const avgOffPeak    = mean(offPeakPrices.map(p => p.price_eur_per_kwh))
  const avgPeak       = mean(peakPrices.map(p => p.price_eur_per_kwh))
  const priceDiff     = avgPeak - avgOffPeak

  if (offPeakPrices.length >= 2 && priceDiff > 0.02) {
    const dailySavingEur = Math.round(priceDiff * 120 * 10) / 10  // assume 120 kWh shiftable
    recs.push({
      id: 'rec-live-001',
      title: 'Shift Flexible Loads to Off-Peak Window',
      summary: `Price differential of €${priceDiff.toFixed(4)}/kWh identified — ${offPeakPrices.length} low-cost hours available today`,
      explanation: `Analysis of the live spot price feed shows ${offPeakPrices.length} off-peak intervals averaging €${avgOffPeak.toFixed(4)}/kWh vs ${peakPrices.length} peak hours at €${avgPeak.toFixed(4)}/kWh. Shifting deferrable loads (HVAC, compressors) saves an estimated €${dailySavingEur}/day.`,
      affectedObject: 'Flexible load devices',
      estimatedImpact: `~€${dailySavingEur}/day`,
      category: 'cost_saving',
      priority: dailySavingEur > 30 ? 'high' : 'medium',
      confidence: 0.91,
      useCase: 'Smart Energy',
      advisoryNote: 'Advisory only — no automated control. Requires operator review.',
      createdAt: now
    })
  }

  // ── 2. PV self-consumption ─────────────────────────────────────────────────
  const pvPeak = pvHistory.filter(p => p.power_kw > 0)
  const avgPvPeak = mean(pvPeak.map(p => p.power_kw))
  if (pvPeak.length >= 3 && avgPvPeak > 10) {
    recs.push({
      id: 'rec-live-002',
      title: 'Maximise Self-Consumption During PV Peak',
      summary: `PV system generating avg ${avgPvPeak.toFixed(1)} kW during ${pvPeak.length} active hours — schedule deferrable loads now`,
      explanation: `Live PV data shows generation peaking at ${avgPvPeak.toFixed(1)} kW over ${pvPeak.length} active intervals. Scheduling flexible loads during peak PV hours increases self-consumption ratio and reduces grid import costs.`,
      affectedObject: 'PV systems + flexible loads',
      estimatedImpact: `+${Math.round(avgPvPeak * 0.25)} kWh self-consumption`,
      category: 'efficiency',
      priority: 'high',
      confidence: 0.87,
      useCase: 'Smart Energy',
      advisoryNote: 'Advisory only — no automated control. Requires operator review.',
      createdAt: now
    })
  }

  // ── 3. Anomaly follow-up ───────────────────────────────────────────────────
  const powerValues = meterHistory.map((r: Record<string, unknown>) => {
    const l1 = (r['active_power_l1_w'] as number ?? 0)
    const l2 = (r['active_power_l2_w'] as number ?? 0)
    const l3 = (r['active_power_l3_w'] as number ?? 0)
    return (l1 + l2 + l3) / 1000
  })
  const mu = mean(powerValues)
  const sd = stddev(powerValues, mu)
  const anomalyCount = powerValues.filter(v => Math.abs(v - mu) > 2 * sd).length

  if (anomalyCount > 0) {
    recs.push({
      id: 'rec-live-003',
      title: `Investigate ${anomalyCount} Statistical Anomaly${anomalyCount > 1 ? 'ies' : ''} in Meter Readings`,
      summary: `${anomalyCount} readings exceed 2σ deviation from the 24h baseline — physical inspection recommended`,
      explanation: `Statistical analysis of the 24h meter history detected ${anomalyCount} readings deviating more than 2 standard deviations from the mean of ${mu.toFixed(2)} kW. This may indicate equipment malfunction, unscheduled process changes, or data quality issues.`,
      affectedObject: 'Energy meters',
      estimatedImpact: 'Risk mitigation — prevent undetected consumption drift',
      category: 'maintenance',
      priority: anomalyCount > 5 ? 'high' : 'medium',
      confidence: 0.85,
      useCase: 'Smart Energy',
      advisoryNote: 'Advisory only — no automated control. Requires operator review.',
      createdAt: now
    })
  }

  return recs
}

// ─── Trends ───────────────────────────────────────────────────────────────────

/**
 * Compute trend statistics over a history array.
 * Returns min, max, avg, trend direction, and labelled values.
 */
export function computeTrends(
  history: Array<{ timestamp: string; [key: string]: unknown }>,
  valueExtractor: (r: Record<string, unknown>) => number
): TrendResult {
  if (!history.length) {
    return { min: 0, max: 0, avg: 0, trend: 'stable', trendPct: 0, labels: [], values: [] }
  }

  const sorted = [...history].sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  const values  = sorted.map(r => valueExtractor(r as Record<string, unknown>))
  const labels  = sorted.map(r => {
    try {
      return new Date(r.timestamp as string).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    } catch { return r.timestamp as string }
  })

  const mu  = mean(values)
  const mn  = Math.min(...values)
  const mx  = Math.max(...values)

  // Compare first quarter to last quarter to determine direction
  const q = Math.floor(values.length / 4)
  const firstQ = mean(values.slice(0, q || 1))
  const lastQ  = mean(values.slice(-q || -1))
  const changePct = firstQ !== 0 ? ((lastQ - firstQ) / Math.abs(firstQ)) * 100 : 0

  const trend: TrendResult['trend'] = Math.abs(changePct) < 2 ? 'stable' : changePct > 0 ? 'up' : 'down'

  return {
    min: Math.round(mn * 100) / 100,
    max: Math.round(mx * 100) / 100,
    avg: Math.round(mu * 100) / 100,
    trend,
    trendPct: Math.round(changePct * 10) / 10,
    labels,
    values
  }
}

// ─── Power extractor helpers ──────────────────────────────────────────────────

export function extractMeterPowerKw(r: Record<string, unknown>): number {
  const l1 = (r['active_power_l1_w'] as number ?? 0)
  const l2 = (r['active_power_l2_w'] as number ?? 0)
  const l3 = (r['active_power_l3_w'] as number ?? 0)
  return (l1 + l2 + l3) / 1000
}

export function extractPvPowerKw(r: Record<string, unknown>): number {
  return (r['power_kw'] as number ?? 0)
}

export function extractStreetlightPowerW(r: Record<string, unknown>): number {
  return (r['power_w'] as number ?? 0)
}

export function extractTrafficIndex(r: Record<string, unknown>): number {
  return (r['traffic_index'] as number ?? 0)
}
