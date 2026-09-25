import { useEffect, useMemo, useRef, useState } from 'react'
import { api, ApiError } from '../api/client'
import type { SimulationInput, SimulationResponse } from '../api/types'
import { buildScenarioComparisons, canAcceptScenarioResponse, createScenario, MAX_SCENARIOS, updateScenarioInput } from '../lib/scenarioAnalysis'
import type { ScenarioLike } from '../lib/scenarioAnalysis'

const editableFields: { key: keyof SimulationInput; label: string; unit: string }[] = [
  { key: 'steam_injection_pressure', label: 'Injection pressure', unit: 'pressure' },
  { key: 'steam_volume', label: 'Steam volume', unit: 'm³' },
  { key: 'soak_time', label: 'Soak time', unit: 'hr' },
  { key: 'production_cutoff', label: 'Production cutoff', unit: 'cutoff' },
  { key: 'stroke_length', label: 'Stroke length', unit: 'in' },
  { key: 'rpm_or_spm', label: 'Pump speed', unit: 'SPM' },
  { key: 'vfd_frequency', label: 'VFD frequency', unit: 'Hz' },
]

export function WhatIfPanel({
  input,
  disabled,
  onApply,
}: {
  input: SimulationInput
  disabled: boolean
  onApply: (scenarioInput: SimulationInput) => void
}) {
  const [scenarios, setScenarios] = useState<ScenarioLike[]>([])
  const [baselineId, setBaselineId] = useState<string | null>(null)
  const nextId = useRef(1)

  useEffect(() => {
    nextId.current = 1
    const baseline = createScenario(`scenario-${nextId.current++}`, 'Baseline', input)
    setScenarios([{ ...baseline, status: 'dirty' }])
    setBaselineId(baseline.id)
  }, [input.well_id])

  const comparisons = useMemo(() => buildScenarioComparisons(scenarios, baselineId), [scenarios, baselineId])

  const addScenario = () => {
    setScenarios(current => {
      if (current.length >= MAX_SCENARIOS) return current
      return [...current, createScenario(`scenario-${nextId.current++}`, `Scenario ${current.length + 1}`, input)]
    })
  }

  const renameScenario = (id: string, name: string) => setScenarios(current => current.map(scenario => (
    scenario.id === id ? { ...scenario, name } : scenario
  )))

  const editScenario = (id: string, key: keyof SimulationInput, value: number) => setScenarios(current => current.map(scenario => (
    scenario.id === id ? updateScenarioInput(scenario, { [key]: value }) : scenario
  )))

  const removeScenario = (id: string) => setScenarios(current => {
    const next = current.filter(scenario => scenario.id !== id)
    if (baselineId === id) setBaselineId(next[0]?.id ?? null)
    return next
  })

  const evaluate = (id: string) => {
    const scenario = scenarios.find(item => item.id === id)
    if (!scenario || disabled) return
    const requestId = scenario.requestId + 1
    const version = scenario.version
    const requestInput = { ...scenario.input }
    setScenarios(current => current.map(item => item.id === id ? { ...item, requestId, status: 'loading', error: null } : item))

    void api.simulate(requestInput)
      .then((result: SimulationResponse) => {
        setScenarios(current => current.map(item => (
          item.id === id && canAcceptScenarioResponse(item, version, requestId)
            ? { ...item, status: 'ready', result, error: null }
            : item
        )))
      })
      .catch(error => {
        const message = error instanceof ApiError ? error.message : 'Scenario evaluation failed'
        setScenarios(current => current.map(item => (
          item.id === id && canAcceptScenarioResponse(item, version, requestId)
            ? { ...item, status: 'error', error: message }
            : item
        )))
      })
  }

  return (
    <section className="panel wide whatif-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Decision sandbox</span>
          <h2>What-if scenario comparison</h2>
        </div>
        <button disabled={disabled || scenarios.length >= MAX_SCENARIOS} onClick={addScenario} type="button">Add scenario</button>
      </div>
      <p className="muted">
        Evaluates each scenario with the Stage 1 simulation API. Production, SOR, and energy values are proxy estimates for comparison only, not field-calibrated measurements.
      </p>

      {!scenarios.length ? (
        <p className="empty">Select a well to create scenarios.</p>
      ) : (
        <>
          <div className="scenario-grid">
            {scenarios.map(scenario => (
              <article className={`scenario-card ${scenario.status}`} key={scenario.id}>
                <div className="scenario-card-head">
                  <input
                    aria-label="Scenario name"
                    value={scenario.name}
                    onChange={event => renameScenario(scenario.id, event.target.value)}
                  />
                  <button aria-pressed={baselineId === scenario.id} className={baselineId === scenario.id ? 'active' : ''} onClick={() => setBaselineId(scenario.id)} type="button">Baseline</button>
                  <button disabled={scenarios.length <= 1} onClick={() => removeScenario(scenario.id)} type="button">Remove</button>
                </div>
                <div className="scenario-fields">
                  {editableFields.map(field => (
                    <label key={field.key}>
                      <span>{field.label}</span>
                      <input
                        type="number"
                        value={Number(scenario.input[field.key] ?? 0)}
                        onChange={event => editScenario(scenario.id, field.key, Number(event.target.value))}
                      />
                      <small>{field.unit}</small>
                    </label>
                  ))}
                </div>
                <div className="scenario-actions">
                  <button disabled={disabled || scenario.status === 'loading'} onClick={() => evaluate(scenario.id)} type="button">
                    {scenario.status === 'loading' ? 'Evaluating...' : scenario.status === 'error' ? 'Retry' : 'Evaluate'}
                  </button>
                  <button onClick={() => onApply(scenario.input)} type="button">Apply to inputs</button>
                  <span className={`scenario-status ${scenario.status}`}>
                    {statusLabel(scenario.status)}
                  </span>
                </div>
                {scenario.error && <p className="scenario-error">{scenario.error}</p>}
              </article>
            ))}
          </div>

          <div className="scenario-table-wrap">
            <table className="scenario-table">
              <caption>Side-by-side comparison against selected baseline</caption>
              <thead>
                <tr>
                  <th>Scenario</th>
                  <th>Production proxy<br /><small>model units/day</small></th>
                  <th>SOR proxy<br /><small>steam / production</small></th>
                  <th>Energy proxy<br /><small>index / bbl</small></th>
                  <th>Available risk<br /><small>max 0–1 score</small></th>
                  <th>Trade-off note</th>
                </tr>
              </thead>
              <tbody>
                {comparisons.map(row => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.name}</strong>
                      {baselineId === row.id && <span className="baseline-chip">Baseline</span>}
                    </td>
                    <MetricCell value={row.evaluation?.productionProxy} delta={row.differences.productionProxy} goodWhen="higher" />
                    <MetricCell value={row.evaluation?.steamOilRatioProxy} delta={row.differences.steamOilRatioProxy} goodWhen="lower" />
                    <MetricCell value={row.evaluation?.energyProxy} delta={row.differences.energyProxy} goodWhen="lower" />
                    <MetricCell value={row.evaluation?.maxRisk} delta={row.differences.maxRisk} goodWhen="lower" />
                    <td>{tradeoff(row)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}

function MetricCell({ value, delta, goodWhen }: { value: number | null | undefined; delta: number | null; goodWhen: 'higher' | 'lower' }) {
  const tone = delta === null || Math.abs(delta) < 0.0001 ? 'neutral' : (goodWhen === 'higher' ? delta > 0 : delta < 0) ? 'good' : 'watch'
  return (
    <td>
      <span className="metric-value">{format(value)}</span>
      <small className={`delta ${tone}`}>{formatDelta(delta)}</small>
    </td>
  )
}

function tradeoff(row: ReturnType<typeof buildScenarioComparisons>[number]) {
  if (!row.evaluation) return row.status === 'dirty' ? 'Needs evaluation after edits.' : row.error ?? '—'
  const messages = []
  if ((row.differences.productionProxy ?? 0) > 0) messages.push('more production')
  if ((row.differences.energyProxy ?? 0) > 0) messages.push('higher energy')
  if ((row.differences.maxRisk ?? 0) > 0) messages.push('higher risk')
  if ((row.differences.steamOilRatioProxy ?? 0) < 0) messages.push('lower SOR')
  return messages.length ? messages.join(' • ') : 'Similar to baseline'
}

function statusLabel(status: ScenarioLike['status']) {
  if (status === 'dirty') return 'Needs reevaluation'
  if (status === 'ready') return 'Evaluated'
  if (status === 'loading') return 'Running'
  if (status === 'error') return 'Failed'
  return 'Not evaluated'
}

function format(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(3) : '—'
}

function formatDelta(value: number | null) {
  if (value === null || !Number.isFinite(value)) return 'Δ —'
  if (Math.abs(value) < 0.0001) return 'Δ 0'
  return `Δ ${value > 0 ? '+' : ''}${value.toFixed(3)}`
}
