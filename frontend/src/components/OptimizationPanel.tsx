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
  return <section className="panel wide"><div className="section-heading"><div><span className="eyebrow">Stage 2 XGBoost</span><h2>Optimization</h2></div><button disabled={disabled || loading} onClick={onRun}>{loading ? 'Calculating...' : 'Run optimization'}</button></div><p className="muted">Model-backed recommendations from the synthetic Baghewala baseline dataset; not for field operations.</p><table><thead><tr><th>Parameter</th><th>Current</th><th>Recommended</th></tr></thead><tbody>{rows.map(([name, before, after]) => <tr key={name}><td>{name}</td><td>{format(before)}</td><td>{after === undefined ? 'Run optimization' : format(after)}</td></tr>)}</tbody></table>{result && <><table><thead><tr><th>Prediction</th><th>Current</th><th>Recommended</th></tr></thead><tbody>{predictionRows.map(([name, before, after]) => <tr key={name}><td>{name}</td><td>{format(before)}</td><td>{format(after)}</td></tr>)}</tbody></table><p className="confidence">Score: {format(result.predictions.current_score)} -&gt; {format(result.predictions.recommended_score)} - {result.predictions.confidence}</p><button onClick={onVisualize}>Visualize Recommendation</button></>}</section>
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
