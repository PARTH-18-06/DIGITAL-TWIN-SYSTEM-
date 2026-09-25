import type { ForecastRun, HistoryResponse, ObservationRecord } from '../api/types'

export type ChartSource = 'observation' | 'simulation' | 'forecast'

export type ChartPoint = {
  timestamp: string
  value: number | null
  source: ChartSource
  label: string
  synthetic: boolean
}

export type ChartSeries = {
  key: string
  title: string
  unit: string
  points: ChartPoint[]
}

export type DateRange = {
  start: string
  end: string
}

export function buildHistoricalSeries(
  observations: ObservationRecord[],
  history: HistoryResponse | null,
  range: DateRange,
): ChartSeries[] {
  const inRange = (timestamp: string) => isWithinRange(timestamp, range)
  const observationPoints = observations.filter(row => inRange(String(row.date)))

  return [
    {
      key: 'production',
      title: 'Oil production',
      unit: 'model units/day',
      points: [
        ...observationPoints.map(row => point(row.date, numberFrom(row, 'oil_production', 'oil_flow_rate'), 'observation', observationLabel(row), isSynthetic(row))),
        ...(history?.forecast_runs ?? []).filter(run => inRange(run.forecast_date)).map(forecastPoint),
      ].sort(byTimestamp),
    },
    {
      key: 'temperature',
      title: 'Reservoir temperature',
      unit: '°C',
      points: [
        ...observationPoints.map(row => point(row.date, numberFrom(row, 'reservoir_temperature'), 'observation', observationLabel(row), isSynthetic(row))),
        ...(history?.simulation_runs ?? []).filter(run => inRange(run.created_at)).map(run => point(run.created_at, numberFrom(run.input_parameters, 'temperature'), 'simulation', 'Simulation scenario', false)),
      ].sort(byTimestamp),
    },
    {
      key: 'steam',
      title: 'Steam volume',
      unit: 'm³',
      points: [
        ...observationPoints.map(row => point(row.date, numberFrom(row, 'steam_volume'), 'observation', observationLabel(row), isSynthetic(row))),
        ...(history?.simulation_runs ?? []).filter(run => inRange(run.created_at)).map(run => point(run.created_at, numberFrom(run.input_parameters, 'steam_volume'), 'simulation', 'Simulation scenario', false)),
      ].sort(byTimestamp),
    },
    {
      key: 'risk',
      title: 'Available risk',
      unit: '0–1 score',
      points: [
        ...observationPoints.map(row => point(row.date, maxNumber(
          numberFrom(row, 'rod_floating_risk'),
          numberFrom(row, 'impact_loading_risk'),
          numberFrom(row, 'pump_unsetting_risk'),
          numberFrom(row, 'rod_failure_risk'),
        ), 'observation', observationLabel(row), isSynthetic(row))),
        ...(history?.simulation_runs ?? []).filter(run => inRange(run.created_at)).map(run => point(run.created_at, maxNumber(
          numberFrom(run.simulation_output?.simulation?.risk_scores, 'rod_floating_risk'),
          numberFrom(run.simulation_output?.simulation?.risk_scores, 'impact_loading_risk'),
          numberFrom(run.simulation_output?.simulation?.risk_scores, 'pump_failure_risk'),
        ), 'simulation', 'Simulation scenario', false)),
      ].sort(byTimestamp),
    },
  ]
}

export function defaultDateRange(observations: ObservationRecord[], history: HistoryResponse | null): DateRange {
  const timestamps = [
    ...observations.map(row => String(row.date)),
    ...(history?.simulation_runs ?? []).map(run => run.created_at),
    ...(history?.forecast_runs ?? []).map(run => run.forecast_date),
  ].map(timestamp => new Date(timestamp).getTime()).filter(Number.isFinite)

  if (!timestamps.length) return { start: '', end: '' }
  return {
    start: toDateInput(new Date(Math.min(...timestamps))),
    end: toDateInput(new Date(Math.max(...timestamps))),
  }
}

export function filterNonMissing(points: ChartPoint[]) {
  return points.filter(point => typeof point.value === 'number' && Number.isFinite(point.value))
}

export function predictionIntervalUnavailable() {
  return {
    label: 'Prediction interval unavailable',
    reason: 'No calibration or validation artifact in this project supports statistically valid prediction intervals. R² values and classifier scores are not converted into confidence ranges.',
  }
}

function forecastPoint(run: ForecastRun): ChartPoint {
  return point(run.forecast_date, run.predicted_oil_production, 'forecast', 'Forecast run', false)
}

function point(timestamp: unknown, value: number | null, source: ChartSource, label: string, synthetic: boolean): ChartPoint {
  return {
    timestamp: String(timestamp ?? ''),
    value,
    source,
    label,
    synthetic,
  }
}

function isWithinRange(timestamp: string, range: DateRange) {
  const time = new Date(timestamp).getTime()
  if (!Number.isFinite(time)) return false
  const start = range.start ? new Date(`${range.start}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY
  const end = range.end ? new Date(`${range.end}T23:59:59`).getTime() : Number.POSITIVE_INFINITY
  return time >= start && time <= end
}

function byTimestamp(left: ChartPoint, right: ChartPoint) {
  return new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime()
}

function toDateInput(date: Date) {
  return date.toISOString().slice(0, 10)
}

function numberFrom(record: object | undefined, ...keys: string[]) {
  if (!record) return null
  const values = record as Record<string, unknown>
  for (const key of keys) {
    const value = values[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return null
}

function maxNumber(...values: (number | null)[]) {
  const finite = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  return finite.length ? Math.max(...finite) : null
}

function observationLabel(row: ObservationRecord) {
  if (row.data_kind === 'synthetic_sample') return 'Synthetic observation'
  if (row.data_kind === 'field_measurement') {
    return row.field_validated ? 'Field measurement' : 'Field measurement (unverified)'
  }
  return 'Observation (unknown provenance)'
}

function isSynthetic(row: ObservationRecord) {
  return row.data_kind === 'synthetic_sample'
}
