import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildHistoricalSeries,
  defaultDateRange,
  filterNonMissing,
  predictionIntervalUnavailable,
} from '../src/lib/historicalCharts.ts'
import type { HistoryResponse, ObservationRecord } from '../src/api/types.ts'

const observations: ObservationRecord[] = [
  {
    well_id: 'well-1',
    date: '2023-08-21',
    oil_production: 10,
    reservoir_temperature: 58,
    steam_volume: 800,
    rod_floating_risk: 0.2,
    data_kind: 'synthetic_sample',
  },
  {
    well_id: 'well-1',
    date: '2023-08-22',
    oil_production: null,
    reservoir_temperature: 59,
    steam_volume: null,
    rod_floating_risk: 0.3,
    data_kind: 'field_measurement',
    field_validated: false,
  },
  {
    well_id: 'well-1',
    date: '2023-08-23',
    oil_production: 14,
    reservoir_temperature: null,
    steam_volume: 900,
    rod_floating_risk: null,
  },
]

const history: HistoryResponse = {
  well_id: 'well-1',
  simulation_runs: [{
    id: 'sim-1',
    well_id: 'well-1',
    created_at: '2023-08-22T12:00:00Z',
    input_parameters: {
      well_id: 'well-1',
      temperature: 80,
      pressure: 4,
      viscosity: 1000,
      rpm_or_spm: 8,
      steam_injection_pressure: 20,
      steam_volume: 950,
      soak_time: 24,
      production_cutoff: 10,
      stroke_length: 55,
      vfd_frequency: 40,
      fluid_level: 40,
      water_cut: 0.2,
    },
    simulation_output: {
      well_id: 'well-1',
      simulation: {
        flow_speed: 0.08,
        flow_direction: 'forward',
        temperature_color_value: 0.4,
        pressure_intensity: 0.2,
        pump_stroke_speed: 8,
        rod_movement_behavior: 'normal',
        warnings: [],
        risk_scores: { rod_floating_risk: 0.25, impact_loading_risk: 0.1, pump_failure_risk: 0.12 },
      },
      raw_metrics: { viscosity_estimate: 1000, pump_displacement: 12 },
    },
  }],
  optimization_runs: [],
  forecast_runs: [{
    id: 'forecast-1',
    well_id: 'well-1',
    forecast_date: '2023-08-24',
    input_snapshot: {},
    predicted_oil_production: 18,
    risk_output: {},
    model_metadata: { history_source: 'supabase:well_observations' },
    created_at: '2026-09-10T00:00:00Z',
  }],
}

test('historical series distinguishes observations, scenarios, and forecasts in timestamp order', () => {
  const series = buildHistoricalSeries(observations, history, { start: '2023-08-21', end: '2023-08-24' })
  const production = series.find(item => item.key === 'production')
  const temperature = series.find(item => item.key === 'temperature')

  assert.deepEqual(production?.points.map(point => point.source), ['observation', 'observation', 'observation', 'forecast'])
  assert.equal(production?.points[0].synthetic, true)
  assert.equal(production?.points[1].label, 'Field measurement (unverified)')
  assert.equal(production?.points[2].label, 'Observation (unknown provenance)')
  assert.equal(production?.points.at(-1)?.source, 'forecast')
  assert.ok(temperature?.points.some(point => point.source === 'simulation' && point.label === 'Simulation scenario'))
})

test('historical date filtering excludes out-of-range records and keeps missing values as gaps', () => {
  const series = buildHistoricalSeries(observations, history, { start: '2023-08-22', end: '2023-08-23' })
  const production = series.find(item => item.key === 'production')

  assert.deepEqual(production?.points.map(point => point.timestamp), ['2023-08-22', '2023-08-23'])
  assert.equal(production?.points[0].value, null)
  assert.deepEqual(filterNonMissing(production?.points ?? []).map(point => point.value), [14])
})

test('default date range uses actual observation, simulation, and forecast dates', () => {
  assert.deepEqual(defaultDateRange(observations, history), { start: '2023-08-21', end: '2023-08-24' })
})

test('prediction intervals remain unavailable without calibration artifacts', () => {
  const unavailable = predictionIntervalUnavailable()

  assert.match(unavailable.label, /unavailable/i)
  assert.match(unavailable.reason, /R² values and classifier scores are not converted/i)
})
