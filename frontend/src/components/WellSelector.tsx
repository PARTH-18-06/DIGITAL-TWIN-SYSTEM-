import type { Well } from '../api/types'

export function WellSelector({ wells, value, loading, onChange }: { wells: Well[]; value: string; loading: boolean; onChange: (id: string) => void }) {
  return <section className="panel selector"><label htmlFor="well">Active well</label><select id="well" value={value} disabled={loading || !wells.length} onChange={e => onChange(e.target.value)}><option value="">{loading ? 'Loading wells…' : wells.length ? 'Select a well' : 'No wells available'}</option>{wells.map(w => <option key={w.id} value={w.id}>{w.well_name}</option>)}</select></section>
}
