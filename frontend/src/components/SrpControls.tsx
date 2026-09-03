import type { FieldErrors, SimulationInput } from '../api/types'
import { Field } from './Field'

type Props = { values: SimulationInput; errors: FieldErrors; update: (key: keyof SimulationInput, value: number) => void }
export function SrpControls({ values, errors, update }: Props) {
  return <section className="panel"><h2>SRP controls</h2><div className="form-grid"><Field label="Stroke length" value={values.stroke_length} min={38} max={73.5} error={errors.stroke_length} onChange={e => update('stroke_length', e.currentTarget.valueAsNumber)} /><Field label="Pump speed (SPM)" value={values.rpm_or_spm} min={3.8} max={11.55} error={errors.rpm_or_spm} onChange={e => update('rpm_or_spm', e.currentTarget.valueAsNumber)} /><Field label="VFD frequency" value={values.vfd_frequency} min={23.75} max={52.5} error={errors.vfd_frequency} onChange={e => update('vfd_frequency', e.currentTarget.valueAsNumber)} /></div></section>
}
