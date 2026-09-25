import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildScenarioComparisons,
  canAcceptScenarioResponse,
  createScenario,
  evaluateScenario,
  updateScenarioInput,
} from '../src/lib/scenarioAnalysis.ts'
import type { SimulationInput, SimulationResponse } from '../src/api/types.ts'

const baseInput: SimulationInput = {
  well_id: 'well-1',
  temperature: 80,
  pressure: 4.2,
  viscosity: 1000,
  rpm_or_spm: 8,
  steam_injection_pressure: 20,
  steam_volume: 900,
  soak_time: 24,
  production_cutoff: 10,
  stroke_length: 55,
  vfd_frequency: 40,
  fluid_level: 40,
  water_cut: 0.15,
}

function response(flowSpeed: number, pumpDisplacement: number, risk: number): SimulationResponse {
  return {
    well_id: 'well-1',
    simulation: {
      flow_speed: flowSpeed,
      flow_direction: flowSpeed > 0 ? 'forward' : flowSpeed < 0 ? 'reverse' : 'stalled',
      temperature_color_value: 0.4,
      pressure_intensity: 0.2,
      pump_stroke_speed: 8,
      rod_movement_behavior: 'normal',
      warnings: risk > 0.5 ? ['watch risk'] : [],
      risk_scores: {
        rod_floating_risk: risk,
        impact_loading_risk: risk / 2,
        pump_failure_risk: risk / 3,
      },
    },
    raw_metrics: {
      viscosity_estimate: 1000,
      pump_displacement: pumpDisplacement,
    },
  }
}

test('scenarios capture independent copies of input and edits mark dirty', () => {
  const scenario = createScenario('s1', 'Scenario 1', baseInput)
  baseInput.steam_volume = 1000

  assert.equal(scenario.input.steam_volume, 900)

  const edited = updateScenarioInput(scenario, { steam_volume: 1200 })

  assert.equal(edited.input.steam_volume, 1200)
  assert.equal(scenario.input.steam_volume, 900)
  assert.equal(edited.status, 'dirty')
  assert.equal(edited.version, scenario.version + 1)
  assert.equal(edited.result, null)
})

test('scenario comparison reports baseline differences without choosing a best scenario', () => {
  const baseline = { ...createScenario('base', 'Baseline', baseInput), status: 'ready' as const, result: response(0.06, 16, 0.2) }
  const highOutput = { ...createScenario('high', 'Higher steam', { ...baseInput, steam_volume: 1200 }), status: 'ready' as const, result: response(0.08, 18, 0.35) }

  const rows = buildScenarioComparisons([baseline, highOutput], 'base')
  const higher = rows.find(row => row.id === 'high')

  assert.ok((higher?.differences.productionProxy ?? 0) > 0)
  assert.ok((higher?.differences.maxRisk ?? 0) > 0)
  assert.equal(Object.hasOwn(higher ?? {}, 'best'), false)
})

test('scenario response guard rejects stale edits, newer requests, and deleted scenarios', () => {
  const scenario = { ...createScenario('s1', 'Scenario 1', baseInput), version: 2, requestId: 7 }

  assert.equal(canAcceptScenarioResponse(scenario, 2, 7), true)
  assert.equal(canAcceptScenarioResponse(scenario, 1, 7), false)
  assert.equal(canAcceptScenarioResponse(scenario, 2, 6), false)
  assert.equal(canAcceptScenarioResponse(undefined, 2, 7), false)
})

test('dirty scenarios are excluded from active comparisons after edits', () => {
  const ready = { ...createScenario('base', 'Baseline', baseInput), status: 'ready' as const, result: response(0.06, 16, 0.2) }
  const dirty = updateScenarioInput(ready, { steam_volume: 1200 })

  const rows = buildScenarioComparisons([dirty], 'base')
  const dirtyRow = rows.find(row => row.id === dirty.id)

  assert.equal(dirtyRow?.evaluation, null)
  assert.equal(dirtyRow?.differences.productionProxy, null)
})

test('scenario evaluation preserves available risk and proxy units as nullable values', () => {
  const evaluation = evaluateScenario(baseInput, response(-0.04, 12, 0.6))

  assert.equal(evaluation?.flowDirection, 'reverse')
  assert.equal(evaluation?.warnings, 1)
  assert.equal(evaluation?.maxRisk, 0.6)
  assert.equal(typeof evaluation?.productionProxy, 'number')
  assert.equal(typeof evaluation?.steamOilRatioProxy, 'number')
  assert.equal(typeof evaluation?.energyProxy, 'number')
})

test('partial scenario failures are isolated from successful scenario comparisons', () => {
  const failed = {
    ...createScenario('failed', 'Bad case', baseInput),
    status: 'error' as const,
    error: 'Validation failed',
  }
  const ready = {
    ...createScenario('ready', 'Good case', { ...baseInput, steam_volume: 850 }),
    status: 'ready' as const,
    result: response(0.07, 14, 0.22),
  }

  const rows = buildScenarioComparisons([failed, ready], 'ready')

  assert.equal(rows.find(row => row.id === 'failed')?.error, 'Validation failed')
  assert.equal(rows.find(row => row.id === 'failed')?.evaluation, null)
  assert.equal(typeof rows.find(row => row.id === 'ready')?.evaluation?.productionProxy, 'number')
})
