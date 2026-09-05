import type { ForecastResponse, HistoryResponse, SimulationInput, Well } from './types'

export const DEFAULT_INPUT: SimulationInput = { well_id: '', temperature: 80, pressure: 4.2, viscosity: 1000, rpm_or_spm: 8, steam_injection_pressure: 20, steam_volume: 900, soak_time: 24, production_cutoff: 10, stroke_length: 55, vfd_frequency: 40, fluid_level: 40, water_cut: 0.15 }

type OperatingValues = Partial<Omit<SimulationInput, 'well_id'>>
const fields = {
  temperature: ['reservoir_temperature', 'temperature'],
  pressure: ['reservoir_pressure', 'pressure'],
  viscosity: ['oil_viscosity', 'viscosity'],
  steam_injection_pressure: ['injection_pressure', 'steam_injection_pressure'],
  steam_volume: ['steam_volume'],
  soak_time: ['soak_time'],
  production_cutoff: ['production_cutoff'],
  stroke_length: ['stroke_length'],
  rpm_or_spm: ['spm', 'rpm_or_spm'],
  vfd_frequency: ['vfd_frequency'],
  fluid_level: ['fluid_level'],
  water_cut: ['water_cut'],
} as const
const controlFields = ['steam_injection_pressure', 'steam_volume', 'soak_time', 'production_cutoff', 'stroke_length', 'rpm_or_spm', 'vfd_frequency'] as const

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function operatingValues(value: unknown): OperatingValues {
  const source = record(value)
  const values: OperatingValues = {}
  for (const key of Object.keys(fields) as (keyof typeof fields)[]) {
    const number = fields[key].map(alias => source[alias]).find(value => typeof value === 'number' && Number.isFinite(value))
    if (typeof number === 'number') values[key] = number
  }
  return values
}

function timestamp(value: unknown): number {
  return typeof value === 'string' ? Date.parse(value) : NaN
}

export function resolveWellInput(well: Well, history: HistoryResponse | null = null, forecast: ForecastResponse | null = null) {
  const properties = record(well.oil_properties)
  const propertyValues = operatingValues(properties)
  const baselineDate = timestamp(properties.dataset_latest_record_date)
  const candidates = history?.well_id === well.id ? history.forecast_runs.map(run => ({
    wellId: run.well_id, snapshot: run.input_snapshot, source: run.model_metadata.history_source, createdAt: run.created_at,
  })) : []
  if (forecast?.well_id === well.id) candidates.push({ wellId: forecast.well_id, snapshot: forecast.input_snapshot, source: forecast.history_source, createdAt: '' })

  // Forecast snapshots contain the observed base features, unlike simulation
  // inputs/recommendations, which may be user-edited what-if scenarios.
  // Forecast execution time is not observation time: prefer the newest data.
  const observation = candidates.map(candidate => {
    const snapshot = record(candidate.snapshot)
    return { ...candidate, date: snapshot.latest_observed_at, time: timestamp(snapshot.latest_observed_at), values: operatingValues(snapshot.features) }
  }).filter(candidate => candidate.wellId === well.id
    && ['supabase:well_observations', 'local_csv_development_fallback'].includes(String(candidate.source))
    && Number.isFinite(candidate.time)
    && (!Number.isFinite(baselineDate) || candidate.time >= baselineDate)
    && controlFields.every(key => candidate.values[key] !== undefined))
    .sort((a, b) => b.time - a.time || (timestamp(b.createdAt) || 0) - (timestamp(a.createdAt) || 0))[0]

  return {
    input: { ...DEFAULT_INPUT, ...propertyValues, ...operatingValues(well), ...observation?.values, well_id: well.id },
    hasOperatingParameters: Boolean(observation) || controlFields.every(key => propertyValues[key] !== undefined),
    observationDate: observation ? String(observation.date) : null,
  }
}

export function mergeUneditedInput(current: SimulationInput, prefilled: SimulationInput, editedFields: ReadonlySet<keyof SimulationInput>): SimulationInput {
  if (current.well_id !== prefilled.well_id) return current
  return { ...prefilled, ...Object.fromEntries([...editedFields].filter(key => key !== 'well_id').map(key => [key, current[key]])) }
}
