import type { FieldErrors, SimulationInput } from '../api/types'
import { Field } from './Field'

type Props = { values: SimulationInput; errors: FieldErrors; update: (key: keyof SimulationInput, value: number) => void }
export function CssControls({ values, errors, update }: Props) {
  return <section className="panel"><h2>CSS controls</h2><div className="form-grid"><Field label="Injection pressure" value={values.steam_injection_pressure} min={9.5665} max={29.4} error={errors.steam_injection_pressure} onChange={e => update('steam_injection_pressure', e.currentTarget.valueAsNumber)} /><Field label="Steam volume" value={values.steam_volume} min={475} max={1473.0135} error={errors.steam_volume} onChange={e => update('steam_volume', e.currentTarget.valueAsNumber)} /><Field label="Soak time (hours)" value={values.soak_time} min={11.4} max={51.324} error={errors.soak_time} onChange={e => update('soak_time', e.currentTarget.valueAsNumber)} /><Field label="Production cutoff" value={values.production_cutoff} min={5.7} max={20.496} error={errors.production_cutoff} onChange={e => update('production_cutoff', e.currentTarget.valueAsNumber)} /></div></section>
}
