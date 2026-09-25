import type { SimulationInput, SimulationResponse } from '../api/types'

export type ScenarioStatus = 'idle' | 'dirty' | 'loading' | 'ready' | 'error'

export type ScenarioEvaluation = {
  productionProxy: number | null
  steamOilRatioProxy: number | null
  energyProxy: number | null
  maxRisk: number | null
  flowDirection: string
  warnings: number
}

export type ScenarioLike = {
  id: string
  name: string
  input: SimulationInput
  status: ScenarioStatus
  version: number
  requestId: number
  error?: string | null
  result?: SimulationResponse | null
}

export type ScenarioComparisonRow = {
  id: string
  name: string
  status: ScenarioStatus
  error: string | null
  evaluation: ScenarioEvaluation | null
  differences: {
    productionProxy: number | null
    steamOilRatioProxy: number | null
    energyProxy: number | null
    maxRisk: number | null
  }
}

export const MAX_SCENARIOS = 4

export function createScenario(id: string, name: string, input: SimulationInput): ScenarioLike {
  return {
    id,
    name,
    input: cloneInput(input),
    status: 'dirty',
    version: 0,
    requestId: 0,
    error: null,
    result: null,
  }
}

export function updateScenarioInput(scenario: ScenarioLike, patch: Partial<SimulationInput>): ScenarioLike {
  return {
    ...scenario,
    input: { ...scenario.input, ...patch },
    status: 'dirty',
    version: scenario.version + 1,
    error: null,
    result: null,
  }
}

export function canAcceptScenarioResponse(scenario: ScenarioLike | undefined, version: number, requestId: number) {
  return Boolean(scenario) && scenario?.version === version && scenario?.requestId === requestId
}

export function evaluateScenario(input: SimulationInput, result: SimulationResponse | null | undefined): ScenarioEvaluation | null {
  if (!result) return null
  const riskScores = result.simulation.risk_scores
  const maxRisk = maxFinite(riskScores.rod_floating_risk, riskScores.impact_loading_risk, riskScores.pump_failure_risk)
  const speedMagnitude = Math.abs(result.simulation.flow_speed)
  const pumpDisplacement = finiteOrNull(result.raw_metrics.pump_displacement)
  const waterCutFactor = clamp01(1 - input.water_cut)
  const productionProxy = pumpDisplacement === null ? null : pumpDisplacement * waterCutFactor * Math.max(0.2, speedMagnitude * 20)
  const steamOilRatioProxy = productionProxy && productionProxy > 0 ? input.steam_volume / productionProxy : null
  const energyProxy = productionProxy && productionProxy > 0
    ? ((input.steam_volume * input.steam_injection_pressure) + (input.rpm_or_spm * 12) + ((input.vfd_frequency ?? 0) * 3)) / productionProxy
    : null

  return {
    productionProxy,
    steamOilRatioProxy,
    energyProxy,
    maxRisk: maxRisk ?? null,
    flowDirection: result.simulation.flow_direction,
    warnings: result.simulation.warnings.length,
  }
}

export function buildScenarioComparisons(scenarios: ScenarioLike[], baselineId: string | null): ScenarioComparisonRow[] {
  const baseline = scenarios.find(scenario => scenario.id === baselineId && scenario.status === 'ready')
    ?? scenarios.find(scenario => scenario.status === 'ready')
  const baselineEvaluation = baseline ? evaluateScenario(baseline.input, baseline.result) : null

  return scenarios.map(scenario => {
    const evaluation = scenario.status === 'ready' ? evaluateScenario(scenario.input, scenario.result) : null
    return {
      id: scenario.id,
      name: scenario.name,
      status: scenario.status,
      error: scenario.error ?? null,
      evaluation,
      differences: {
        productionProxy: difference(evaluation?.productionProxy, baselineEvaluation?.productionProxy),
        steamOilRatioProxy: difference(evaluation?.steamOilRatioProxy, baselineEvaluation?.steamOilRatioProxy),
        energyProxy: difference(evaluation?.energyProxy, baselineEvaluation?.energyProxy),
        maxRisk: difference(evaluation?.maxRisk, baselineEvaluation?.maxRisk),
      },
    }
  })
}

export function cloneInput(input: SimulationInput): SimulationInput {
  return { ...input }
}

function difference(value: number | null | undefined, baseline: number | null | undefined) {
  return typeof value === 'number' && typeof baseline === 'number' && Number.isFinite(value) && Number.isFinite(baseline)
    ? value - baseline
    : null
}

function finiteOrNull(value: number | undefined | null) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function maxFinite(...values: (number | null | undefined)[]) {
  const finite = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  return finite.length ? Math.max(...finite) : null
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}
