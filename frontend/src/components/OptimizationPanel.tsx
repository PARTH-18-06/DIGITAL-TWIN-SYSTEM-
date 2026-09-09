import type { OptimizationResponse, SimulationInput } from '../api/types'

export function OptimizationPanel({ current, result, loading, disabled, onRun, onVisualize }: { current: SimulationInput; result: OptimizationResponse | null; loading: boolean; disabled: boolean; onRun: () => void; onVisualize: () => void }) {
  const rows: [string, number | undefined, number | undefined][] = [
    ['Steam volume', current.steam_volume, result?.recommendedParameters.steam_volume],
    ['Injection pressure', current.steam_injection_pressure, result?.recommendedParameters.steam_injection_pressure],
    ['Soak time', current.soak_time, result?.recommendedParameters.soak_time],
    ['Production cutoff', current.production_cutoff, result?.recommendedParameters.production_cutoff],
    ['Stroke length', current.stroke_length, result?.recommendedParameters.stroke_length],
    ['Pump speed', current.rpm_or_spm, result?.recommendedParameters.rpm_or_spm],
    ['VFD frequency', current.vfd_frequency, result?.recommendedParameters.vfd_frequency],
  ]
  const predictionRows: [string, number | undefined, number | undefined][] = [
    ['Oil production', result?.predictions.current.oil_production, result?.predictions.recommended.oil_production],
    ['Energy per barrel', result?.predictions.current.energy_per_barrel, result?.predictions.recommended.energy_per_barrel],
    ['Steam-oil ratio', result?.predictions.current.steam_oil_ratio, result?.predictions.recommended.steam_oil_ratio],
    ['Avg risk score', averageRisk(result?.predictions.current), averageRisk(result?.predictions.recommended)],
  ]
  const advisor = result ? buildAdvisor(current, result) : null
  return <section className="panel wide"><div className="section-heading"><div><span className="eyebrow">Stage 2 XGBoost</span><h2>Optimization</h2></div><button disabled={disabled || loading} onClick={onRun}>{loading ? 'Calculating...' : 'Run optimization'}</button></div><p className="muted">Model-backed recommendations from the synthetic Baghewala baseline dataset; not for field operations.</p><table><thead><tr><th>Parameter</th><th>Current</th><th>Recommended</th></tr></thead><tbody>{rows.map(([name, before, after]) => <tr key={name}><td>{name}</td><td>{format(before)}</td><td>{after === undefined ? 'Run optimization' : format(after)}</td></tr>)}</tbody></table>{result && advisor && <><table><thead><tr><th>Prediction</th><th>Current</th><th>Recommended</th></tr></thead><tbody>{predictionRows.map(([name, before, after]) => <tr key={name}><td>{name}</td><td>{format(before)}</td><td>{format(after)}</td></tr>)}</tbody></table><ExplainableOptimizationAdvisor advisor={advisor} /><p className="confidence">Score: {format(result.predictions.current_score)} -&gt; {format(result.predictions.recommended_score)} - {result.predictions.confidence}</p><button onClick={onVisualize}>Visualize Recommendation</button></>}</section>
}

function format(value: number | undefined) {
  return value === undefined ? '-' : Number(value).toFixed(3)
}

function averageRisk(predictions?: Record<string, number>) {
  if (!predictions) return undefined
  return (
    predictions.rod_floating_risk +
    predictions.impact_loading_risk +
    predictions.pump_unsetting_risk +
    predictions.rod_failure_risk
  ) / 4
}

type Advisor = {
  bullets: string[]
  healthScore: number
  status: 'Good' | 'Monitor' | 'High Risk'
}

function ExplainableOptimizationAdvisor({ advisor }: { advisor: Advisor }) {
  return <aside className="advisor-panel" aria-label="Explainable optimization advisor"><div><span className="eyebrow">Explainable optimization advisor</span><h3>Why this recommendation?</h3><p className="muted">Decision support only. Final field commands should be reviewed by an operator.</p></div><div className={`health-score ${advisor.status.toLowerCase().replace(' ', '-')}`}><span>Well Health Score</span><strong>{advisor.healthScore}/100</strong><small>Status: {advisor.status}</small></div><ul>{advisor.bullets.map(bullet => <li key={bullet}>{bullet}</li>)}</ul></aside>
}

function buildAdvisor(current: SimulationInput, result: OptimizationResponse): Advisor {
  const currentPredictions = result.predictions.current
  const recommendedPredictions = result.predictions.recommended
  const bullets = [
    changeBullet('Production', numberFrom(currentPredictions.oil_production), numberFrom(recommendedPredictions.oil_production), 'higher', 'is expected to improve', 'is expected to reduce, so check the operating tradeoff'),
    changeBullet('Steam-oil ratio', numberFrom(currentPredictions.steam_oil_ratio), numberFrom(recommendedPredictions.steam_oil_ratio), 'lower', 'is expected to reduce', 'increases, so monitor steam efficiency'),
    changeBullet('Energy per barrel', numberFrom(currentPredictions.energy_per_barrel), numberFrom(recommendedPredictions.energy_per_barrel), 'lower', 'is expected to reduce', 'increases, so monitor power cost'),
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
  const production = normalizedDelta(numberFrom(current.oil_production), numberFrom(recommended.oil_production), 'higher')
  const energy = normalizedDelta(numberFrom(current.energy_per_barrel), numberFrom(recommended.energy_per_barrel), 'lower')
  const sor = normalizedDelta(numberFrom(current.steam_oil_ratio), numberFrom(recommended.steam_oil_ratio), 'lower')
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

function numberFrom(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function isUsable(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}
