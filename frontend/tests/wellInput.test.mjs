import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_INPUT, mergeUneditedInput, resolveWellInput } from '../src/api/wellInput.ts'

// Small fixtures from the two verified 2023-08-23 observations; no application mock data.
const observed001 = {
  injection_pressure: 28,
  steam_volume: 1103.725771,
  soak_time: 33.354566,
  production_cutoff: 9.794411,
  stroke_length: 58.103137,
  spm: 8.019392,
  vfd_frequency: 32.139141,
  reservoir_temperature: 58.110624,
  reservoir_pressure: 3.922753,
  oil_viscosity: 6235.549820,
  fluid_level: 38.184397,
  water_cut: 0.220957,
}
const observed013 = {
  injection_pressure: 20.060645,
  steam_volume: 1211.450102,
  soak_time: 30.085847,
  production_cutoff: 12.173643,
  stroke_length: 50.370412,
  spm: 9.305652,
  vfd_frequency: 34.426682,
  reservoir_temperature: 62.887782,
  reservoir_pressure: 4.063979,
  oil_viscosity: 5248.931643,
  fluid_level: 32.317336,
  water_cut: 0.239564,
}
const aliases = {
  steam_injection_pressure: 'injection_pressure',
  steam_volume: 'steam_volume',
  soak_time: 'soak_time',
  production_cutoff: 'production_cutoff',
  stroke_length: 'stroke_length',
  rpm_or_spm: 'spm',
  vfd_frequency: 'vfd_frequency',
}
const well001 = makeWell('b0381e59-e86a-4a3b-b4b1-492f24e69b59', 'BGH-001', observed001)
const well013 = makeWell('6e6113ed-066c-4253-9a94-3a1d7af36589', 'BGH-013', observed013)

function makeWell(id, well_name, observed) {
  return {
    id,
    well_name,
    reservoir_temperature: observed.reservoir_temperature,
    reservoir_pressure: observed.reservoir_pressure,
    oil_properties: {
      oil_viscosity: observed.oil_viscosity,
      dataset_latest_record_date: '2023-08-23',
      data_classification: `synthetic baseline dataset (${well_name})`,
    },
    created_at: null,
  }
}

function forecastRun(well, features, options = {}) {
  return {
    id: `forecast-${well.well_name}`,
    well_id: well.id,
    forecast_date: '2023-08-24',
    input_snapshot: {
      latest_observed_at: options.observedAt ?? '2023-08-23',
      features: { ...features },
    },
    model_metadata: { history_source: options.source ?? 'supabase:well_observations' },
    predicted_oil_production: 18.964144,
    risk_output: {},
    created_at: options.createdAt ?? '2026-09-05T08:22:41Z',
  }
}

function history(well, runs = []) {
  return { well_id: well.id, forecast_runs: runs, simulation_runs: [], optimization_runs: [] }
}

function assertControls(input, observation) {
  for (const [inputName, observationName] of Object.entries(aliases)) {
    assert.equal(input[inputName], observation[observationName], inputName)
  }
}

function assertDefaultControls(input) {
  for (const inputName of Object.keys(aliases)) assert.equal(input[inputName], DEFAULT_INPUT[inputName], inputName)
}

test('BGH-001 and BGH-013 use their own actual controls and dataset aliases', () => {
  for (const [well, observation] of [[well001, observed001], [well013, observed013]]) {
    const resolved = resolveWellInput(well, history(well, [forecastRun(well, observation)]))
    assert.equal(resolved.hasOperatingParameters, true)
    assert.equal(resolved.observationDate, '2023-08-23')
    assert.equal(resolved.input.well_id, well.id)
    assertControls(resolved.input, observation)
    assert.equal(resolved.input.viscosity, observation.oil_viscosity)
    assert.equal(resolved.input.fluid_level, observation.fluid_level)
    assert.equal(resolved.input.water_cut, observation.water_cut)
  }
})

test('switching to a DEMO well without observations restores generic controls', () => {
  const demo = {
    ...well001,
    id: '82959887-2e05-48b3-8ed1-0b8c329e8487',
    well_name: 'DEMO-001 (synthetic)',
    reservoir_temperature: 80,
    reservoir_pressure: 4.2,
    oil_properties: { viscosity: 1000, data_classification: 'synthetic demo' },
  }
  resolveWellInput(well001, history(well001, [forecastRun(well001, observed001)]))
  const resolved = resolveWellInput(demo, history(demo))
  assert.equal(resolved.hasOperatingParameters, false)
  assert.equal(resolved.input.well_id, demo.id)
  assertDefaultControls(resolved.input)
  assert.equal(resolved.input.temperature, 80)
  assert.equal(resolved.input.pressure, 4.2)
})

test('simulation and optimization scenario inputs are never mistaken for observations', () => {
  const scenarios = history(well001)
  const changed = { ...DEFAULT_INPUT, well_id: well001.id, steam_volume: 1300, rpm_or_spm: 11 }
  scenarios.simulation_runs = [{ well_id: well001.id, input_parameters: changed }]
  scenarios.optimization_runs = [{ well_id: well001.id, current_parameters: changed, recommended_parameters: changed }]
  const resolved = resolveWellInput(well001, scenarios)
  assert.equal(resolved.hasOperatingParameters, false)
  assertDefaultControls(resolved.input)
})

test('latest observation date takes precedence over forecast creation order', () => {
  const well = { ...well001, oil_properties: { ...well001.oil_properties, dataset_latest_record_date: '2023-08-22' } }
  const olderObservation = forecastRun(well, observed013, { observedAt: '2023-08-22', createdAt: '2026-09-06T12:00:00Z' })
  const newerObservation = forecastRun(well, observed001, { observedAt: '2023-08-23', createdAt: '2026-09-01T12:00:00Z' })
  const resolved = resolveWellInput(well, history(well, [olderObservation, newerObservation]))
  assert.equal(resolved.observationDate, '2023-08-23')
  assertControls(resolved.input, observed001)
})

test('wrong-well history and mismatched forecast rows are rejected', () => {
  const wrongHistory = history(well013, [forecastRun(well013, observed013)])
  const wrongRow = history(well001, [forecastRun(well013, observed013)])
  for (const records of [wrongHistory, wrongRow]) {
    const resolved = resolveWellInput(well001, records)
    assert.equal(resolved.hasOperatingParameters, false)
    assert.equal(resolved.input.well_id, well001.id)
    assertDefaultControls(resolved.input)
  }
})

test('snapshots older than the well latest dataset date do not claim to be current', () => {
  const stale = forecastRun(well001, observed001, { observedAt: '2023-08-22' })
  const resolved = resolveWellInput(well001, history(well001, [stale]))
  assert.equal(resolved.hasOperatingParameters, false)
  assertDefaultControls(resolved.input)
})

test('malformed or incomplete controls fall back without coercing absent values to zero', () => {
  const malformed = [null, Number.NaN, Number.POSITIVE_INFINITY, '', undefined]
  for (const value of malformed) {
    const invalidFeatures = { ...observed001, steam_volume: value }
    if (value === undefined) delete invalidFeatures.steam_volume
    const resolved = resolveWellInput(well001, history(well001, [forecastRun(well001, invalidFeatures)]))
    assert.equal(resolved.hasOperatingParameters, false, `steam_volume=${String(value)}`)
    assertDefaultControls(resolved.input)
    assert.notEqual(resolved.input.steam_volume, 0)
  }
})

test('unrecognized forecast provenance cannot supply actual operating controls', () => {
  const untrusted = forecastRun(well001, observed001, { source: 'user_scenario' })
  const resolved = resolveWellInput(well001, history(well001, [untrusted]))
  assert.equal(resolved.hasOperatingParameters, false)
  assertDefaultControls(resolved.input)
})

test('direct flat oil_properties controls can prefill without a forecast run', () => {
  const well = { ...well001, oil_properties: { ...well001.oil_properties, ...observed001 } }
  const resolved = resolveWellInput(well)
  assert.equal(resolved.hasOperatingParameters, true)
  assertControls(resolved.input, observed001)
})

test('an explicit forecast response supplies its latest observed values', () => {
  const run = forecastRun(well013, observed013)
  const response = {
    well_id: well013.id,
    input_snapshot: run.input_snapshot,
    history_source: 'supabase:well_observations',
    forecast_date: run.forecast_date,
  }
  const resolved = resolveWellInput(well013, history(well013), response)
  assert.equal(resolved.hasOperatingParameters, true)
  assertControls(resolved.input, observed013)
  const wrongWell = resolveWellInput(well001, history(well001), response)
  assert.equal(wrongWell.hasOperatingParameters, false)
  assertDefaultControls(wrongWell.input)
})

test('documented local CSV observation provenance remains accepted', () => {
  const run = forecastRun(well001, observed001, { source: 'local_csv_development_fallback' })
  const resolved = resolveWellInput(well001, history(well001, [run]))
  assert.equal(resolved.hasOperatingParameters, true)
  assertControls(resolved.input, observed001)
})

test('asynchronous hydration preserves manually edited fields and hydrates untouched ones', () => {
  const current = { ...DEFAULT_INPUT, well_id: well001.id, steam_volume: 950, rpm_or_spm: 10 }
  const prefilled = resolveWellInput(well001, history(well001, [forecastRun(well001, observed001)])).input
  const resolved = mergeUneditedInput(current, prefilled, new Set(['steam_volume', 'rpm_or_spm']))
  assert.equal(resolved.steam_volume, 950)
  assert.equal(resolved.rpm_or_spm, 10)
  assert.equal(resolved.steam_injection_pressure, observed001.injection_pressure)
  assert.equal(resolved.soak_time, observed001.soak_time)
  assert.equal(current.soak_time, DEFAULT_INPUT.soak_time, 'current input is not mutated')
})

test('late hydration for another well cannot overwrite the currently selected input', () => {
  const current = { ...DEFAULT_INPUT, well_id: well013.id, steam_volume: 1234 }
  const stalePrefill = resolveWellInput(well001, history(well001, [forecastRun(well001, observed001)])).input
  assert.deepEqual(mergeUneditedInput(current, stalePrefill, new Set()), current)
})
