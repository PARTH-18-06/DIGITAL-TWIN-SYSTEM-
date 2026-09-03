import type { ForecastResponse, OptimizationResponse } from '../api/types'

export function NextDayForecast({ currentProduction, result, loading, disabled, onRun }: { currentProduction?: number; result: ForecastResponse | null; loading: boolean; disabled: boolean; onRun: () => void }) {
  return <section className="panel wide"><div className="section-heading"><div><span className="eyebrow">Temporal forecast</span><h2>Next-day production</h2></div><button disabled={disabled || loading} onClick={onRun}>{loading ? 'Forecasting...' : 'Run forecast'}</button></div><p className="muted">Uses prior well observations, lag features, and shifted rolling windows from the synthetic baseline dataset.</p>{result ? <div className="result-grid compact"><article><span>Current prediction</span><strong>{format(currentProduction)}</strong><small>model units/day</small></article><article><span>Next day</span><strong>{format(result.predicted_oil_production)}</strong><small>{result.forecast_date}</small></article><article><span>Chronological R2</span><strong>{format(result.validation_summary.chronological_r2)}</strong></article><article><span>Held-out R2</span><strong>{format(result.validation_summary.held_out_well_r2)}</strong></article></div> : <p className="empty">Run a forecast to estimate next-day oil production.</p>}{result && <p className="confidence">Source: {labelSource(result.history_source)} - {result.persistence_status}</p>}</section>
}

export function currentProductionFromOptimization(result: OptimizationResponse | null) {
  return result?.predictions.current.oil_production
}

function format(value: number | undefined) {
  return value === undefined ? '-' : Number(value).toFixed(3)
}

function labelSource(source: string) {
  return source === 'local_csv_development_fallback' ? 'local CSV fallback' : source
}
