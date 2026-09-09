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

const latestLimit = 10

export function HistoryPanel({ history, loading }: { history: HistoryResponse | null; loading: boolean }) {
  const [filter, setFilter] = useState<RunFilter>('all')
  const [showAll, setShowAll] = useState(false)
  const counts = {
    simulation: history?.simulation_runs.length ?? 0,
    optimization: history?.optimization_runs.length ?? 0,
    forecast: history?.forecast_runs.length ?? 0,
  }
  const totalRuns = counts.simulation + counts.optimization + counts.forecast
  const timeline = useMemo(() => buildTimeline(history), [history])
  const visibleRuns = filter === 'all' ? timeline : timeline.filter(item => item.type === filter)
  const displayedRuns = showAll ? visibleRuns : visibleRuns.slice(0, latestLimit)

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
          <div className="history-filters" aria-label="Filter run history">
            {filters.map(item => (
              <button
                className={filter === item.key ? `active ${item.key}` : item.key}
                key={item.key}
                onClick={() => {
                  setFilter(item.key)
                  setShowAll(false)
                }}
                type="button"
              >
                {item.label}
                <span>{countForFilter(item.key, counts, totalRuns)}</span>
              </button>
            ))}
          </div>
          {visibleRuns.length > latestLimit && (
            <div className="history-limit-row">
              <p className="muted">
                Showing {displayedRuns.length} of {visibleRuns.length} {filter === 'all' ? 'runs' : `${filter} runs`}, newest first.
              </p>
              <button onClick={() => setShowAll(value => !value)} type="button">
                {showAll ? 'Show latest 10' : 'Show all runs'}
              </button>
            </div>
          )}
        </>
      )}

      {loading ? (
        <p className="muted">Loading history...</p>
      ) : !totalRuns ? (
        <p className="empty">No runs recorded for this well.</p>
      ) : !visibleRuns.length ? (
        <p className="empty">{emptyMessage(filter)}</p>
      ) : (
        <div className="history-list compact">
          {displayedRuns.map(item => <HistoryCard item={item} key={`${item.type}-${item.id}`} />)}
        </div>
      )}
    </section>
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
      <RunMain
        badge="Simulation"
        date={item.created_at}
        metrics={[
          ['Flow', sentenceCase(simulation?.flow_direction)],
          ['Risk', formatPercent(maxRisk)],
        ]}
        summary={`${sentenceCase(simulation?.flow_direction)} flow • Failure risk ${formatPercent(maxRisk)} • ${warningCount} ${pluralize('warning', warningCount)}`}
      />
      <RunDetails id={item.id}>
        <DetailGrid
          rows={[
            ['Flow direction', sentenceCase(simulation?.flow_direction)],
            ['Flow speed', formatNumber(simulation?.flow_speed)],
            ['Rod floating risk', formatPercent(risks?.rod_floating_risk)],
            ['Impact loading risk', formatPercent(risks?.impact_loading_risk)],
            ['Pump failure risk', formatPercent(risks?.pump_failure_risk)],
            ['Rod behavior', sentenceCase(simulation?.rod_movement_behavior?.replaceAll('_', ' '))],
          ]}
        />
      </RunDetails>
    </article>
  )
}

function OptimizationCard({ item }: { item: Extract<HistoryItem, { type: 'optimization' }> }) {
  const predicted = item.run.predicted_results
  const current = predicted?.current ?? {}
  const recommended = predicted?.recommended ?? {}
  const oilBefore = valueFor(current, 'oil_production', 'predicted_oil_flow_rate')
  const oilAfter = valueFor(recommended, 'oil_production', 'predicted_oil_flow_rate')
  const sorBefore = valueFor(current, 'steam_oil_ratio', 'sor')
  const sorAfter = valueFor(recommended, 'steam_oil_ratio', 'sor')

  return (
    <article className="history-card optimization">
      <RunMain
        badge="Optimization"
        date={item.created_at}
        metrics={[
          ['Oil', formatChange(oilBefore, oilAfter, 1)],
          ['Score', scoreLabel(predicted?.current_score, predicted?.recommended_score)],
        ]}
        summary={`Oil ${formatChange(oilBefore, oilAfter, 1)} • SOR ${formatChange(sorBefore, sorAfter, 1)} • ${scoreLabel(predicted?.current_score, predicted?.recommended_score)}`}
      />
      <RunDetails id={item.id}>
        <DetailGrid
          rows={[
            ['Production', formatChange(oilBefore, oilAfter)],
            ['SOR', formatChange(sorBefore, sorAfter)],
            ['Energy/barrel', formatChange(valueFor(current, 'energy_per_barrel'), valueFor(recommended, 'energy_per_barrel'))],
            ['Score', formatChange(predicted?.current_score, predicted?.recommended_score)],
            ['Avg risk', formatChange(averageRisk(current), averageRisk(recommended))],
            ['Optimizer', textOrDash(String(predicted?.optimizer?.method ?? ''))],
          ]}
        />
      </RunDetails>
    </article>
  )
}

function ForecastCard({ item }: { item: Extract<HistoryItem, { type: 'forecast' }> }) {
  const source = String(item.run.model_metadata?.history_source ?? item.run.model_metadata?.source ?? item.run.model_metadata?.model_version ?? '')

  return (
    <article className="history-card forecast">
      <RunMain
        badge="Forecast"
        date={item.created_at}
        metrics={[
          ['Oil', formatNumber(item.run.predicted_oil_production, 1)],
          ['Date', textOrDash(item.run.forecast_date)],
        ]}
        summary={`Next-day oil: ${formatNumber(item.run.predicted_oil_production, 1)} • Forecast date: ${textOrDash(item.run.forecast_date)}`}
      />
      <RunDetails id={item.id}>
        <DetailGrid
          rows={[
            ['Forecast date', textOrDash(item.run.forecast_date)],
            ['Predicted oil', formatNumber(item.run.predicted_oil_production)],
            ['Confidence/source', textOrDash(source)],
            ['Snapshot fields', String(Object.keys(item.run.input_snapshot ?? {}).length)],
          ]}
        />
      </RunDetails>
    </article>
  )
}

function RunMain({ badge, date, summary, metrics }: { badge: string; date: string; summary: string; metrics: [string, string][] }) {
  return (
    <div className="history-main-row">
      <div className="history-run-head">
        <span className="history-badge">{badge}</span>
        <time>{formatDate(date)}</time>
      </div>
      <p>{summary}</p>
      <div className="history-key-metrics">
        {metrics.map(([label, value]) => (
          <span key={label}>
            <small>{label}</small>
            {value}
          </span>
        ))}
      </div>
    </div>
  )
}

function RunDetails({ children, id }: { children: ReactNode; id: string }) {
  return (
    <details className="history-details">
      <summary>Details</summary>
      <small className="history-id">Run ID: {id}</small>
      {children}
    </details>
  )
}

function DetailGrid({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="history-detail-grid">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
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

function countForFilter(filter: RunFilter, counts: { simulation: number; optimization: number; forecast: number }, total: number) {
  return filter === 'all' ? total : counts[filter]
}

function emptyMessage(filter: RunFilter) {
  const label = filter === 'all' ? 'runs' : `${filter} runs`
  return `No ${label} found for this well.`
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString()
}

function formatNumber(value: number | undefined | null, digits = 2) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '—'
}

function formatPercent(value: number | undefined | null) {
  return typeof value === 'number' && Number.isFinite(value) ? `${Math.round(value * 100)}%` : '—'
}

function formatChange(current: number | undefined | null, recommended: number | undefined | null, digits = 2) {
  return `${formatNumber(current, digits)} → ${formatNumber(recommended, digits)}`
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

function scoreLabel(current: number | undefined, recommended: number | undefined) {
  if (typeof current !== 'number' || typeof recommended !== 'number') return 'Score —'
  if (recommended > current) return 'Score improved'
  if (recommended < current) return 'Score lower'
  return 'Score unchanged'
}

function sentenceCase(value: string | undefined | null) {
  const text = textOrDash(value)
  return text === '—' ? text : text.charAt(0).toUpperCase() + text.slice(1)
}

function pluralize(label: string, count: number) {
  return count === 1 ? label : `${label}s`
}
