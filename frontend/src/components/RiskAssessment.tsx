import type { RiskResponse } from '../api/types'

const labels: Record<keyof RiskResponse['risks'], string> = {
  rod_floating: 'Rod floating',
  impact_loading: 'Impact loading',
  pump_unsetting: 'Pump unsetting',
  rod_failure: 'Rod failure',
}

export function RiskAssessment({ result, loading, disabled, onRun }: { result: RiskResponse | null; loading: boolean; disabled: boolean; onRun: () => void }) {
  return <section className="panel wide"><div className="section-heading"><div><span className="eyebrow">History-based risk</span><h2>Risk assessment</h2></div><button disabled={disabled || loading} onClick={onRun}>{loading ? 'Assessing...' : 'Assess risk'}</button></div><p className="muted">Categories are synthetic-dataset-relative interpretations, not validated equipment safety limits.</p>{result ? <div className="risk-grid">{(Object.keys(result.risks) as Array<keyof RiskResponse['risks']>).map(key => <div key={key}><div><span>{labels[key]}</span><strong>{result.risks[key].category}</strong></div><progress max="1" value={result.risks[key].risk_score} /><small>score {format(result.risks[key].risk_score)}{result.risks[key].classifier_probability === null ? ' - no classifier' : ` - probability ${format(result.risks[key].classifier_probability)}`}</small></div>)}</div> : <p className="empty">Run risk assessment to combine continuous scores with LOW/MEDIUM/HIGH interpretations.</p>}</section>
}

function format(value: number) {
  return Number(value).toFixed(3)
}
