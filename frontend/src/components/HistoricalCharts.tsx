import { useEffect, useMemo, useState } from 'react'
import type { HistoryResponse, ObservationRecord } from '../api/types'
import { buildHistoricalSeries, defaultDateRange, filterNonMissing, predictionIntervalUnavailable } from '../lib/historicalCharts'
import type { ChartPoint, ChartSeries, DateRange } from '../lib/historicalCharts'

export function HistoricalCharts({
  observations,
  history,
  loading,
  error,
}: {
  observations: ObservationRecord[]
  history: HistoryResponse | null
  loading: boolean
  error: string
}) {
  const initialRange = useMemo(() => defaultDateRange(observations, history), [observations, history])
  const [range, setRange] = useState<DateRange>(initialRange)
  const unavailable = predictionIntervalUnavailable()

  useEffect(() => {
    setRange(initialRange)
  }, [initialRange.start, initialRange.end])

  const series = useMemo(() => buildHistoricalSeries(observations, history, range), [observations, history, range])
  const hasData = series.some(item => filterNonMissing(item.points).length > 0)

  return (
    <section className="panel wide historical-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Historical evidence</span>
          <h2>Well trends and forecasts</h2>
        </div>
      </div>
      <p className="muted">
        Observations are labeled by recorded provenance: synthetic sample, unverified field measurement, or unknown. Simulation points are historical scenarios, not measured well behavior.
      </p>

      <div className="chart-controls">
        <label>
          <span>Start date</span>
          <input type="date" value={range.start} onChange={event => setRange(value => ({ ...value, start: event.target.value }))} />
        </label>
        <label>
          <span>End date</span>
          <input type="date" value={range.end} onChange={event => setRange(value => ({ ...value, end: event.target.value }))} />
        </label>
      </div>

      <aside className="uncertainty-note">
        <strong>{unavailable.label}</strong>
        <span>{unavailable.reason}</span>
      </aside>

      {loading ? (
        <p className="muted">Loading observations and run history...</p>
      ) : error ? (
        <p className="empty">{error}</p>
      ) : !hasData ? (
        <p className="empty">No chartable history is available for this well and date range.</p>
      ) : (
        <div className="chart-grid">
          {series.map(item => <MiniChart key={item.key} series={item} />)}
        </div>
      )}
    </section>
  )
}

function MiniChart({ series }: { series: ChartSeries }) {
  const points = filterNonMissing(series.points)
  const width = 480
  const height = 210
  const pad = 34
  const times = points.map(point => new Date(point.timestamp).getTime())
  const values = points.map(point => point.value as number)
  const minTime = Math.min(...times)
  const maxTime = Math.max(...times)
  const minValue = Math.min(...values)
  const maxValue = Math.max(...values)
  const hasRange = Number.isFinite(minTime) && Number.isFinite(maxTime) && Number.isFinite(minValue) && Number.isFinite(maxValue)

  return (
    <article className="mini-chart">
      <div className="mini-chart-head">
        <strong>{series.title}</strong>
        <span>{series.unit}</span>
      </div>
      {!points.length || !hasRange ? (
        <p className="empty">No values available. Missing values are preserved as gaps.</p>
      ) : (
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${series.title} over time`}>
          <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} />
          <line x1={pad} y1={pad} x2={pad} y2={height - pad} />
          {segments(series.points).map((segment, index) => (
            <polyline key={index} points={segment.map(point => coordinates(point, minTime, maxTime, minValue, maxValue, width, height, pad)).join(' ')} />
          ))}
          {points.map((point, index) => {
            const [x, y] = coordinates(point, minTime, maxTime, minValue, maxValue, width, height, pad).split(',').map(Number)
            return (
              <circle className={point.source} cx={x} cy={y} r="4" key={`${point.timestamp}-${point.source}-${point.value}-${index}`}>
                <title>{tooltip(point, series.unit)}</title>
              </circle>
            )
          })}
          <text x={pad} y={height - 8}>{formatDate(new Date(minTime).toISOString())}</text>
          <text x={width - pad - 72} y={height - 8}>{formatDate(new Date(maxTime).toISOString())}</text>
          <text x={pad + 4} y={pad - 10}>{formatValue(maxValue)}</text>
          <text x={pad + 4} y={height - pad - 6}>{formatValue(minValue)}</text>
        </svg>
      )}
      <div className="chart-legend">
        <span className="observation">Synthetic observation</span>
        <span className="simulation">Simulation scenario</span>
        <span className="forecast">Forecast</span>
      </div>
      <details className="chart-data">
        <summary>Chart values</summary>
        <div className="chart-data-list" role="list" aria-label={`${series.title} chart values`}>
          {points.map((point, index) => (
            <button
              type="button"
              key={`${point.timestamp}-${point.source}-${point.value}-${index}`}
              aria-label={tooltip(point, series.unit).replaceAll('\n', ', ')}
            >
              <span>{formatDate(point.timestamp)}</span>
              <strong>{formatValue(point.value)} {series.unit}</strong>
              <small>{point.label}{point.synthetic ? ' · synthetic' : ''}</small>
            </button>
          ))}
        </div>
      </details>
    </article>
  )
}

function segments(points: ChartPoint[]) {
  const output: ChartPoint[][] = []
  let current: ChartPoint[] = []
  for (const point of points) {
    if (typeof point.value === 'number' && Number.isFinite(point.value)) {
      current.push(point)
    } else if (current.length) {
      output.push(current)
      current = []
    }
  }
  if (current.length) output.push(current)
  return output
}

function coordinates(point: ChartPoint, minTime: number, maxTime: number, minValue: number, maxValue: number, width: number, height: number, pad: number) {
  const time = new Date(point.timestamp).getTime()
  const value = point.value as number
  const xRange = maxTime === minTime ? 1 : maxTime - minTime
  const yRange = maxValue === minValue ? 1 : maxValue - minValue
  const x = pad + ((time - minTime) / xRange) * (width - pad * 2)
  const y = (height - pad) - ((value - minValue) / yRange) * (height - pad * 2)
  return `${x.toFixed(2)},${y.toFixed(2)}`
}

function tooltip(point: ChartPoint, unit: string) {
  return `${point.label}${point.synthetic ? ' (synthetic)' : ''}\n${formatDate(point.timestamp)}\n${formatValue(point.value)} ${unit}`
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString()
}

function formatValue(value: number | null) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(2) : '—'
}
