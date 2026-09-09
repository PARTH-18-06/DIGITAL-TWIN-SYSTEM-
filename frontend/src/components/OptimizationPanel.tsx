import { useMemo, useState } from 'react'
import type { OptimizationResponse, SimulationInput } from '../api/types'

type OptimizationTab = 'overview' | 'explanation' | 'technical'
type NumericRow = [string, number | undefined, number | undefined]

const tabs: { key: OptimizationTab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'explanation', label: 'Explanation' },
  { key: 'technical', label: 'Technical Metrics' },
]

export function OptimizationPanel({
  current,
  result,
  loading,
  disabled,
  onRun,
  onVisualize,
}: {
  current: SimulationInput
  result: OptimizationResponse | null
  loading: boolean
  disabled: boolean
  onRun: () => void
  onVisualize: () => void
}) {
  const [activeTab, setActiveTab] = useState<OptimizationTab>('overview')
  const rows = useMemo<NumericRow[]>(() => [
    ['Steam volume', current.steam_volume, result?.recommendedParameters.steam_volume],
    ['Injection pressure', current.steam_injection_pressure, result?.recommendedParameters.steam_injection_pressure],
    ['Soak time', current.soak_time, result?.recommendedParameters.soak_time],
    ['Production cutoff', current.production_cutoff, result?.recommendedParameters.production_cutoff],
    ['Stroke length', current.stroke_length, result?.recommendedParameters.stroke_length],
    ['Pump speed', current.rpm_or_spm, result?.recommendedParameters.rpm_or_spm],
    ['VFD frequency', current.vfd_frequency, result?.recommendedParameters.vfd_frequency],
  ], [current, result])
  const mainMetricRows = useMemo<NumericRow[]>(() => predictionRows(result), [result])
  const advisor = result ? buildAdvisor(current, result) : null

  return (
    <section className="panel wide optimization-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Stage 2 XGBoost</span>
          <h2>Optimization</h2>
        </div>
        <button disabled={disabled || loading} onClick={onRun}>{loading ? 'Calculating...' : 'Run optimization'}</button>
      </div>
      <p className="muted">Model-backed recommendations from the synthetic Baghewala baseline dataset; not for field operations.</p>

      <div className="internal-tabs" aria-label="Optimization result tabs">
        {tabs.map(tab => (
          <button
            className={activeTab === tab.key ? 'active' : ''}
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="tab-pane">
          <ResultTable caption="Recommended parameters" rows={rows} fallback="Run optimization" />
          {result && (
            <>
              <ResultTable caption="Main prediction changes" rows={mainMetricRows} />
              <button onClick={onVisualize}>Visualize Recommendation</button>
            </>
          )}
        </div>
      )}

      {activeTab === 'explanation' && (
        <div className="tab-pane">
          {result && advisor ? (
            <ExplainableOptimizationAdvisor advisor={advisor} />
          ) : (
            <p className="empty">Run optimization to generate operator-friendly explanation bullets.</p>
          )}
        </div>
      )}

      {activeTab === 'technical' && (
        <div className="tab-pane technical-pane">
          {result ? (
            <>
              <ResultTable caption="Detailed prediction metrics" rows={technicalRows(result)} />
              <div className="technical-grid">
                <TechnicalCard label="Objective score" value={`${format(result.predictions.current_score)} → ${format(result.predictions.recommended_score)}`} />
                <TechnicalCard label="Model confidence" value={textOrDash(result.predictions.confidence)} />
                <TechnicalCard label="Optimizer" value={textOrDash(String(result.predictions.optimizer?.method ?? ''))} />
                <TechnicalCard label="Well ID" value={textOrDash(result.well_id)} />
              </div>
              {Object.keys(result.predictions.objective_weights ?? {}).length > 0 && (
                <details className="technical-details">
                  <summary>Objective weights</summary>
                  <pre>{JSON.stringify(result.predictions.objective_weights, null, 2)}</pre>
                </details>
              )}
            </>
          ) : (
            <p className="empty">Run optimization to view objective scores, model confidence, and detailed metrics.</p>
          )}
        </div>
      )}
    </section>
  )
}

function ResultTable({ caption, rows, fallback = '—' }: { caption: string; rows: NumericRow[]; fallback?: string }) {
  return (
    <table>
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th>Metric</th>
          <th>Current</th>
          <th>Recommended</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([name, before, after]) => (
          <tr key={name}>
            <td>{name}</td>
            <td>{format(before)}</td>
            <td>{after === undefined ? fallback : format(after)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function TechnicalCard({ label, value }: { label: string; value: string }) {
  return (
    <article>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}

function predictionRows(result: OptimizationResponse | null): NumericRow[] {
  return [
    ['Oil production', valueFor(result?.predictions.current, 'oil_production', 'predicted_oil_flow_rate'), valueFor(result?.predictions.recommended, 'oil_production', 'predicted_oil_flow_rate')],
    ['Energy per barrel', valueFor(result?.predictions.current, 'energy_per_barrel'), valueFor(result?.predictions.recommended, 'energy_per_barrel')],
    ['Steam-oil ratio', valueFor(result?.predictions.current, 'steam_oil_ratio', 'sor'), valueFor(result?.predictions.recommended, 'steam_oil_ratio', 'sor')],
    ['Avg risk score', averageRisk(result?.predictions.current), averageRisk(result?.predictions.recommended)],
  ]
}

function technicalRows(result: OptimizationResponse): NumericRow[] {
  return [
    ...predictionRows(result),
    ['Rod floating risk', valueFor(result.predictions.current, 'rod_floating_risk'), valueFor(result.predictions.recommended, 'rod_floating_risk')],
    ['Impact loading risk', valueFor(result.predictions.current, 'impact_loading_risk'), valueFor(result.predictions.recommended, 'impact_loading_risk')],
    ['Pump unsetting risk', valueFor(result.predictions.current, 'pump_unsetting_risk'), valueFor(result.predictions.recommended, 'pump_unsetting_risk')],
    ['Rod failure risk', valueFor(result.predictions.current, 'rod_failure_risk'), valueFor(result.predictions.recommended, 'rod_failure_risk')],
  ]
}

function format(value: number | undefined | null) {
  return typeof value === 'number' && Number.isFinite(value) ? Number(value).toFixed(3) : '—'
}

function averageRisk(predictions?: Record<string, number>) {
  if (!predictions) return undefined
  const risks = [
    predictions.rod_floating_risk,
    predictions.impact_loading_risk,
    predictions.pump_unsetting_risk,
    predictions.rod_failure_risk,
  ].filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  return risks.length ? risks.reduce((sum, value) => sum + value, 0) / risks.length : undefined
}

type Advisor = {
  bullets: string[]
  healthScore: number
  status: 'Good' | 'Monitor' | 'High Risk'
}

function ExplainableOptimizationAdvisor({ advisor }: { advisor: Advisor }) {
  return (
    <aside className="advisor-panel" aria-label="Explainable optimization advisor">
      <div>
        <span className="eyebrow">Explainable optimization advisor</span>
        <h3>Why this recommendation?</h3>
        <p className="muted">Decision support only. Final field commands should be reviewed by an operator.</p>
      </div>
      <div className={`health-score ${advisor.status.toLowerCase().replace(' ', '-')}`}>
        <span>Well Health Score</span>
        <strong>{advisor.healthScore}/100</strong>
        <small>Status: {advisor.status}</small>
      </div>
      <ul>{advisor.bullets.map(bullet => <li key={bullet}>{bullet}</li>)}</ul>
    </aside>
  )
}

function buildAdvisor(current: SimulationInput, result: OptimizationResponse): Advisor {
  const currentPredictions = result.predictions.current
  const recommendedPredictions = result.predictions.recommended
  const bullets = [
    changeBullet('Production', valueFor(currentPredictions, 'oil_production', 'predicted_oil_flow_rate'), valueFor(recommendedPredictions, 'oil_production', 'predicted_oil_flow_rate'), 'higher', 'is expected to improve', 'is expected to reduce, so check the operating tradeoff'),
    changeBullet('Steam-oil ratio', valueFor(currentPredictions, 'steam_oil_ratio', 'sor'), valueFor(recommendedPredictions, 'steam_oil_ratio', 'sor'), 'lower', 'is expected to reduce', 'increases, so monitor steam efficiency'),
    changeBullet('Energy per barrel', valueFor(currentPredictions, 'energy_per_barrel'), valueFor(recommendedPredictions, 'energy_per_barrel'), 'lower', 'is expected to reduce', 'increases, so monitor power cost'),
    parameterBullet('Pump speed', current.rpm_or_spm, result.recommendedParameters.rpm_or_spm, 'SPM', 'to improve lift response', 'to reduce lift stress'),
    parameterBullet('Steam injection pressure', current.steam_injection_pressure, result.recommendedParameters.steam_injection_pressure, '', 'to improve reservoir mobility', 'to reduce steam-side stress'),
    riskBullet(averageRisk(currentPredictions), averageRisk(recommendedPredictions)),
  ].filter((bullet): bullet is string => Boolean(bullet))

  return {
    bullets: bullets.slice(0, 6),
    healthScore: calculateHealthScore(result),
    status: healthStatus(averageRisk(recommendedPredictions)),
  }
}

function changeBullet(label: string, before: number | undefined, after: number | undefined, better: 'higher' | 'lower', improvedText: string, tradeoffText: string) {
  if (!isUsable(before) || !isUsable(after) || before === 0) return null
  const delta = ((after - before) / Math.abs(before)) * 100
  const improved = better === 'higher' ? delta > 0 : delta < 0
  const magnitude = Math.abs(delta)
  if (magnitude < 0.5) return `${label} is nearly unchanged (${format(before)} to ${format(after)}).`
  return improved
    ? `${label} ${improvedText} by ${magnitude.toFixed(1)}%.`
    : `${label} ${tradeoffText} by ${magnitude.toFixed(1)}%.`
}

function parameterBullet(label: string, before: number | undefined, after: number | undefined, unit: string, increaseReason: string, decreaseReason: string) {
  if (!isUsable(before) || !isUsable(after)) return null
  const delta = after - before
  if (Math.abs(delta) < 0.05) return null
  const direction = delta > 0 ? 'increased' : 'decreased'
  const reason = delta > 0 ? increaseReason : decreaseReason
  const suffix = unit ? ` ${unit}` : ''
  return `${label} ${direction} from ${format(before)} to ${format(after)}${suffix} ${reason}.`
}

function riskBullet(before: number | undefined, after: number | undefined) {
  if (!isUsable(after)) return null
  const category = riskCategory(after)
  if (!isUsable(before) || before === 0) return `Recommended synthetic risk is ${category}; monitoring is recommended.`
  const delta = ((after - before) / Math.abs(before)) * 100
  if (Math.abs(delta) < 0.5) return `Recommended synthetic risk remains ${category}; monitoring is recommended.`
  return delta < 0
    ? `Average risk is expected to reduce by ${Math.abs(delta).toFixed(1)}% and remains ${category}.`
    : `Average risk increases by ${Math.abs(delta).toFixed(1)}%, so monitoring is recommended.`
}

function calculateHealthScore(result: OptimizationResponse) {
  const current = result.predictions.current
  const recommended = result.predictions.recommended
  const production = normalizedDelta(valueFor(current, 'oil_production', 'predicted_oil_flow_rate'), valueFor(recommended, 'oil_production', 'predicted_oil_flow_rate'), 'higher')
  const energy = normalizedDelta(valueFor(current, 'energy_per_barrel'), valueFor(recommended, 'energy_per_barrel'), 'lower')
  const sor = normalizedDelta(valueFor(current, 'steam_oil_ratio', 'sor'), valueFor(recommended, 'steam_oil_ratio', 'sor'), 'lower')
  const risk = normalizedDelta(averageRisk(current), averageRisk(recommended), 'lower')
  const score = 60 + production * 20 + energy * 12 + sor * 12 + risk * 16
  return Math.round(Math.max(0, Math.min(100, score)))
}

function normalizedDelta(before: number | undefined, after: number | undefined, better: 'higher' | 'lower') {
  if (!isUsable(before) || !isUsable(after) || before === 0) return 0
  const raw = (after - before) / Math.abs(before)
  const signed = better === 'higher' ? raw : -raw
  return Math.max(-1, Math.min(1, signed))
}

function healthStatus(risk: number | undefined): Advisor['status'] {
  if (!isUsable(risk)) return 'Monitor'
  if (risk >= 0.7) return 'High Risk'
  if (risk >= 0.35) return 'Monitor'
  return 'Good'
}

function riskCategory(score: number) {
  if (score >= 0.7) return 'HIGH'
  if (score >= 0.35) return 'MEDIUM'
  return 'LOW'
}

function isUsable(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function textOrDash(value: string | undefined | null) {
  return value?.trim() ? value : '—'
}

function valueFor(record: Record<string, number> | undefined, ...keys: string[]) {
  if (!record) return undefined
  return keys.map(key => record[key]).find(value => typeof value === 'number' && Number.isFinite(value))
}
