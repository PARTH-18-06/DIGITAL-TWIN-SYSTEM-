import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { ForecastRun, HistoryResponse, OptimizationRun, SimulationRun } from '../api/types'

type RunFilter = 'all' | 'simulation' | 'optimization' | 'forecast'
type HistoryItem =
  | { type: 'simulation'; created_at: string; id: string; run: SimulationRun }
  | { type: 'optimization'; created_at: string; id: string; run: OptimizationRun }
  | { type: 'forecast'; created_at: string; id: string; run: ForecastRun }

const filters: { key: RunFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'simulation', label: 'Simulation' },
  { key: 'optimization', label: 'Optimization' },
  { key: 'forecast', label: 'Forecast' },
]

export function HistoryPanel({ history, loading }: { history: HistoryResponse | null; loading: boolean }) {
  const [filter, setFilter] = useState<RunFilter>('all')
  const counts = {
    simulation: history?.simulation_runs.length ?? 0,
    optimization: history?.optimization_runs.length ?? 0,
    forecast: history?.forecast_runs.length ?? 0,
  }
  const totalRuns = counts.simulation + counts.optimization + counts.forecast
  const timeline = useMemo(() => buildTimeline(history), [history])
  const visibleRuns = filter === 'all' ? timeline : timeline.filter(item => item.type === filter)

  return (
    <section className="panel wide history-panel">
      <div className="section-heading history-heading">
        <div>
          <span className="eyebrow">Audit trail</span>
          <h2>Run history</h2>
        </div>
        {history && <span className="count">{totalRuns} runs</span>}
      </div>

      {history && (
        <>
          <div className="history-counters" aria-label="Run history summary">
            <SummaryCount label="Total" value={totalRuns} />
            <SummaryCount label="Simulation" value={counts.simulation} tone="simulation" />
            <SummaryCount label="Optimization" value={counts.optimization} tone="optimization" />
            <SummaryCount label="Forecast" value={counts.forecast} tone="forecast" />
          </div>
          <div className="history-filters" aria-label="Filter run history">
            {filters.map(item => (
              <button
                className={filter === item.key ? `active ${item.key}` : item.key}
                key={item.key}
                onClick={() => setFilter(item.key)}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}

      {loading ? (
        <p className="muted">Loading history...</p>
      ) : !totalRuns ? (
        <p className="empty">No simulation, forecast, or optimization runs recorded for this well.</p>
      ) : !visibleRuns.length ? (
        <p className="empty">No {filter} runs recorded for this well yet.</p>
      ) : (
        <div className="history-list">
          {visibleRuns.map(item => <HistoryCard item={item} key={`${item.type}-${item.id}`} />)}
        </div>
      )}
    </section>
  )
}

function SummaryCount({ label, value, tone = 'all' }: { label: string; value: number; tone?: RunFilter }) {
  return (
    <article className={`history-counter ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}

function HistoryCard({ item }: { item: HistoryItem }) {
  if (item.type === 'simulation') return <SimulationCard item={item} />
  if (item.type === 'optimization') return <OptimizationCard item={item} />
  return <ForecastCard item={item} />
}

function SimulationCard({ item }: { item: Extract<HistoryItem, { type: 'simulation' }> }) {
  const simulation = item.run.simulation_output?.simulation
  const risks = simulation?.risk_scores
  const maxRisk = maxNumber(risks?.rod_floating_risk, risks?.impact_loading_risk, risks?.pump_failure_risk)
  const warningCount = simulation?.warnings?.length ?? 0

  return (
    <article className="history-card simulation">
      <RunHeader badge="Simulation" title="Stage 1 physics run" date={item.created_at} id={item.id} />
      <div className="history-metrics">
        <Metric label="Flow direction" value={textOrDash(simulation?.flow_direction)} />
        <Metric label="Flow speed" value={formatNumber(simulation?.flow_speed)} />
        <Metric label="Max failure risk" value={formatPercent(maxRisk)} />
        <Metric label="Warnings" value={String(warningCount)} />
      </div>
      <RunDetails id={item.id}>
        Rod behavior: {textOrDash(simulation?.rod_movement_behavior)}
      </RunDetails>
    </article>
  )
}

function OptimizationCard({ item }: { item: Extract<HistoryItem, { type: 'optimization' }> }) {
  const predicted = item.run.predicted_results
  const current = predicted?.current ?? {}
  const recommended = predicted?.recommended ?? {}

  return (
    <article className="history-card optimization">
      <RunHeader badge="Optimization" title="Stage 2 recommendation" date={item.created_at} id={item.id} />
      <div className="history-metrics">
        <Metric label="Production" value={formatChange(valueFor(current, 'oil_production', 'predicted_oil_flow_rate'), valueFor(recommended, 'oil_production', 'predicted_oil_flow_rate'))} />
        <Metric label="SOR" value={formatChange(valueFor(current, 'steam_oil_ratio', 'sor'), valueFor(recommended, 'steam_oil_ratio', 'sor'))} />
        <Metric label="Energy/bbl" value={formatChange(valueFor(current, 'energy_per_barrel'), valueFor(recommended, 'energy_per_barrel'))} />
        <Metric label="Score" value={formatChange(predicted?.current_score, predicted?.recommended_score)} />
      </div>
      <RunDetails id={item.id}>
        Optimizer: {textOrDash(String(predicted?.optimizer?.method ?? ''))}
      </RunDetails>
    </article>
  )
}

function ForecastCard({ item }: { item: Extract<HistoryItem, { type: 'forecast' }> }) {
  const source = String(item.run.model_metadata?.history_source ?? item.run.model_metadata?.source ?? '')
  const confidence = String(item.run.model_metadata?.confidence ?? item.run.model_metadata?.model_version ?? '')

  return (
    <article className="history-card forecast">
      <RunHeader badge="Forecast" title="Next-day production" date={item.created_at} id={item.id} />
      <div className="history-metrics">
        <Metric label="Forecast date" value={textOrDash(item.run.forecast_date)} />
        <Metric label="Next-day oil" value={formatNumber(item.run.predicted_oil_production)} />
        <Metric label="Source" value={textOrDash(source)} />
        <Metric label="Confidence" value={textOrDash(confidence)} />
      </div>
      <RunDetails id={item.id}>
        Snapshot fields: {Object.keys(item.run.input_snapshot ?? {}).length}
      </RunDetails>
    </article>
  )
}

function RunHeader({ badge, title, date, id }: { badge: string; title: string; date: string; id: string }) {
  return (
    <div className="history-card-header">
      <div>
        <span className="history-badge">{badge}</span>
        <strong>{title}</strong>
      </div>
      <div className="history-meta">
        <time>{formatDate(date)}</time>
        <small>{id}</small>
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="history-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function RunDetails({ children, id }: { children: ReactNode; id: string }) {
  return (
    <details className="history-details">
      <summary>Details</summary>
      <small>ID: {id}</small>
      <small>{children}</small>
    </details>
  )
}

function buildTimeline(history: HistoryResponse | null): HistoryItem[] {
  if (!history) return []

  return [
    ...history.simulation_runs.map(run => ({ type: 'simulation' as const, created_at: run.created_at, id: run.id, run })),
    ...history.optimization_runs.map(run => ({ type: 'optimization' as const, created_at: run.created_at, id: run.id, run })),
    ...history.forecast_runs.map(run => ({ type: 'forecast' as const, created_at: run.created_at, id: run.id, run })),
  ].sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString()
}

function formatNumber(value: number | undefined | null) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(2) : '—'
}

function formatPercent(value: number | undefined | null) {
  return typeof value === 'number' && Number.isFinite(value) ? `${Math.round(value * 100)}%` : '—'
}

function formatChange(current: number | undefined | null, recommended: number | undefined | null) {
  return `${formatNumber(current)} → ${formatNumber(recommended)}`
}

function textOrDash(value: string | undefined | null) {
  return value?.trim() ? value : '—'
}

function maxNumber(...values: (number | undefined | null)[]) {
  const numbers = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  return numbers.length ? Math.max(...numbers) : undefined
}

function valueFor(record: Record<string, number>, ...keys: string[]) {
  return keys.map(key => record[key]).find(value => typeof value === 'number' && Number.isFinite(value))
}
