// ─────────────────────────────────────────────
// Auth & Users
// ─────────────────────────────────────────────
export type UserRole = 'admin' | 'operator' | 'analyst' | 'viewer'

export interface User {
  id: string
  firstName: string
  lastName: string
  email: string
  role: UserRole
  lastActive: string
  status: 'active' | 'inactive' | 'invited'
}

// ─────────────────────────────────────────────
// Data Sources
// ─────────────────────────────────────────────
export interface DataSource {
  id: string
  name: string
  useCase: 'energy' | 'smart-city'
  sourceType: string
  protocol: string
  objectRef: string
  lastTimestamp: string
  status: 'healthy' | 'warning' | 'error' | 'offline'
  qualityIndicator: number
  siteId: string
}

// ─────────────────────────────────────────────
// Energy Domain
// ─────────────────────────────────────────────
export interface EnergyMeter {
  meterId: string
  deviceType: string
  site: string
  protocol: string
  lastTimestamp: string
  status: 'healthy' | 'warning' | 'error'
  dataQuality: number
  latestValues: EnergyReading
}

export interface EnergyReading {
  activeEnergyTotal_kWh: number
  activePowerTotal_kW: number
  voltage_L1: number
  voltage_L2: number
  voltage_L3: number
  current_L1: number
  current_L2: number
  current_L3: number
  powerFactor: number
  frequency_Hz: number
  timestamp: string
  meterId: string
}

export interface PriceRecord {
  timestamp: string
  priceEurPerKwh: number
  tariffType: string
}

export interface WeatherRecord {
  timestamp: string
  temperature_c: number
  solarIrradiance_w_m2: number
  windSpeed_ms: number
  cloudCover_pct: number
}

export interface PVRecord {
  timestamp: string
  pvSystemId: string
  pvPower_kW: number
  irradiance_w_m2: number
  temperature_c: number
}

export interface ConsumerRecord {
  timestamp: string
  deviceId: string
  deviceType: string
  deviceState: 'on' | 'off' | 'standby'
  devicePower_kW: number
}

export interface EnergyInsight {
  id: string
  type: 'anomaly' | 'trend' | 'recommendation'
  title: string
  summary: string
  severity: 'info' | 'warning' | 'critical'
  source: string
  detectedAt: string
  explanation: string
  confidence: number
}

// ─────────────────────────────────────────────
// Smart City Domain
// ─────────────────────────────────────────────
export interface LightingZone {
  zoneId: string
  zoneName: string
  lightCount: number
  status: 'active' | 'dimmed' | 'off' | 'fault'
  avgDimmingLevel: number
  contextActivityLevel: 'low' | 'medium' | 'high'
  lastUpdate: string
  dataQuality: number
}

export interface Luminaire {
  lightId: string
  zoneId: string
  state: 'on' | 'off' | 'dimmed' | 'fault'
  dimmingLevel: number
  timestamp: string
  healthStatus: 'healthy' | 'warning' | 'error'
}

export interface MotionEvent {
  id: string
  zoneId: string
  timestamp: string
  type: 'pedestrian' | 'vehicle' | 'cyclist'
  confidence: number
}

export interface TrafficSignal {
  id: string
  zoneId: string
  timestamp: string
  flowLevel: 'low' | 'moderate' | 'heavy' | 'congested'
  vehicleCount: number
}

export interface CityEvent {
  id: string
  type: 'incident' | 'construction' | 'festival' | 'emergency'
  zoneId: string
  timestamp: string
  severity: 'low' | 'medium' | 'high'
  description: string
  status: 'active' | 'resolved'
}

// ─────────────────────────────────────────────
// Data Products
// ─────────────────────────────────────────────
export interface DataProduct {
  id: string
  name: string
  category: 'energy' | 'smart-city' | 'cross-domain'
  useCase: string
  semanticScope: string
  version: string
  sourceCount: number
  apiStatus: 'available' | 'maintenance' | 'unavailable'
  exportStatus: 'ready' | 'processing' | 'error'
  lastUpdated: string
  description: string
}

// ─────────────────────────────────────────────
// Events & Alerts
// ─────────────────────────────────────────────
export interface AlertEvent {
  id: string
  useCase: string
  source: string
  category: string
  severity: 'info' | 'warning' | 'error' | 'critical'
  timestamp: string
  status: 'open' | 'acknowledged' | 'resolved'
  message: string
}

// ─────────────────────────────────────────────
// Schema & Mapping
// ─────────────────────────────────────────────
export interface SchemaEntry {
  id: string
  name: string
  useCase: string
  version: string
  status: 'active' | 'draft' | 'deprecated'
  validationLevel: 'full' | 'partial' | 'none'
  format: 'json' | 'avro' | 'protobuf'
}

export interface MappingEntry {
  id: string
  remoteSchema: string
  localSchema: string
  strategy: 'deterministic' | 'ai-driven' | 'hybrid'
  rulesCount: number
  validationStatus: 'valid' | 'warning' | 'invalid'
  lastUpdated: string
}

// ─────────────────────────────────────────────
// Provenance & Audit
// ─────────────────────────────────────────────
export interface AuditEntry {
  id: string
  type: string
  timestamp: string
  action: string
  actor: string
  result: 'success' | 'failure' | 'warning'
  severity: 'info' | 'warning' | 'error'
  details: string
}

// ─────────────────────────────────────────────
// Integrations
// ─────────────────────────────────────────────
export interface Integration {
  id: string
  name: string
  protocol: string
  direction: 'inbound' | 'outbound' | 'bidirectional'
  status: 'active' | 'inactive' | 'error'
  lastActivity: string
  errorCount: number
}

// ─────────────────────────────────────────────
// KPIs
// ─────────────────────────────────────────────
export interface KpiItem {
  label: string
  value: string | number
  unit: string
  trend: 'up' | 'down' | 'stable'
  trendValue?: string
  icon: string
  color?: string
}

// ─────────────────────────────────────────────
// Navigation
// ─────────────────────────────────────────────
export interface NavItem {
  label: string
  icon: string
  to?: string
  children?: NavItem[]
  roles?: UserRole[]
  separator?: boolean
}

// ─────────────────────────────────────────────
// Chart helpers
// ─────────────────────────────────────────────
export interface ChartDataset {
  label: string
  data: number[]
  borderColor?: string
  backgroundColor?: string
  yAxisID?: string
  fill?: boolean
  tension?: number
}
