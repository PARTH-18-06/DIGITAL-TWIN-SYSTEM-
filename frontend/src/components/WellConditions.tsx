import type { Well } from '../api/types'

export function WellConditions({ well, loading }: { well: Well | null; loading: boolean }) {
  const dataLabel = well?.well_name.startsWith('BGH-') ? 'Baseline BGH dataset' : 'Integration demo row'
  return <section className="panel"><div className="section-heading"><h2>Well conditions</h2><span className="demo-tag">{dataLabel}</span></div>{loading ? <p className="muted">Loading well details...</p> : !well ? <p className="muted">Select a well to inspect conditions.</p> : <><div className="metric-row"><span>Reservoir temperature</span><strong>{well.reservoir_temperature ?? '-'} °C</strong></div><div className="metric-row"><span>Reservoir pressure</span><strong>{well.reservoir_pressure ?? '-'} <small>unit TBD</small></strong></div><details><summary>Oil properties</summary><pre>{JSON.stringify(well.oil_properties, null, 2)}</pre></details></>}</section>
}
