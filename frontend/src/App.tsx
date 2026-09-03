import { useEffect, useState } from 'react'
import { api, ApiError } from './api/client'
import type { FieldErrors, HistoryResponse, OptimizationResponse, SimulationInput, SimulationResponse, Well } from './api/types'
import { CssControls } from './components/CssControls'
import { DigitalTwin, type DigitalTwinProps, type TwinMode } from './components/DigitalTwin'
import { HistoryPanel } from './components/HistoryPanel'
import { NextDayForecast, currentProductionFromOptimization } from './components/NextDayForecast'
import { OptimizationPanel } from './components/OptimizationPanel'
import { PredictionDisplay } from './components/PredictionDisplay'
import { RiskAssessment } from './components/RiskAssessment'
import { SimulationPanel } from './components/SimulationPanel'
import { SrpControls } from './components/SrpControls'
import { WellConditions } from './components/WellConditions'
import { WellSelector } from './components/WellSelector'
import './styles.css'
import type { ForecastResponse, RiskResponse } from './api/types'

const defaults: SimulationInput = { well_id: '', temperature: 80, pressure: 4.2, viscosity: 1000, rpm_or_spm: 8, steam_injection_pressure: 20, steam_volume: 900, soak_time: 24, production_cutoff: 10, stroke_length: 55, vfd_frequency: 40, fluid_level: 40, water_cut: 0.15 }

export default function App() {
  const [wells, setWells] = useState<Well[]>([]), [selectedId, setSelectedId] = useState(''), [well, setWell] = useState<Well | null>(null)
  const [input, setInput] = useState(defaults), [simulation, setSimulation] = useState<SimulationResponse | null>(null), [optimization, setOptimization] = useState<OptimizationResponse | null>(null), [history, setHistory] = useState<HistoryResponse | null>(null)
  const [forecast, setForecast] = useState<ForecastResponse | null>(null), [risk, setRisk] = useState<RiskResponse | null>(null), [twinMode, setTwinMode] = useState<TwinMode>('current')
  const [busy, setBusy] = useState({ wells: true, well: false, simulation: false, optimization: false, forecast: false, risk: false, history: false }), [error, setError] = useState(''), [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const loading = (key: keyof typeof busy, value: boolean) => setBusy(old => ({ ...old, [key]: value }))
  const report = (e: unknown) => { const err = e instanceof ApiError ? e : new ApiError('Unexpected error', 0); setError(err.message); setFieldErrors(err.fieldErrors) }

  useEffect(() => { api.wells().then(data => { setWells(data); if (data[0]) setSelectedId(data[0].id) }).catch(report).finally(() => loading('wells', false)) }, [])
  useEffect(() => { if (!selectedId) return; setError(''); setWell(null); setHistory(null); setSimulation(null); setOptimization(null); setForecast(null); setRisk(null); setTwinMode('current'); setInput(v => ({ ...v, well_id: selectedId })); loading('well', true); loading('history', true); Promise.allSettled([api.well(selectedId).then(setWell), api.history(selectedId).then(setHistory)]).then(results => { const rejected = results.find(r => r.status === 'rejected'); if (rejected?.status === 'rejected') report(rejected.reason) }).finally(() => { loading('well', false); loading('history', false) }) }, [selectedId])
  const update = (key: keyof SimulationInput, value: number) => { setInput(v => ({ ...v, [key]: value })); setFieldErrors(v => ({ ...v, [key]: undefined })) }
  const runSimulation = () => { setError(''); setFieldErrors({}); setTwinMode('current'); loading('simulation', true); api.simulate(input).then(r => { setSimulation(r); return api.history(input.well_id).then(setHistory) }).catch(report).finally(() => loading('simulation', false)) }
  const runOptimization = () => { setError(''); setFieldErrors({}); setOptimization(null); loading('optimization', true); api.optimize(input).then(r => { setOptimization(r); return api.history(input.well_id).then(setHistory) }).catch(report).finally(() => loading('optimization', false)) }
  const runForecast = () => { if (!well) return; setError(''); setForecast(null); loading('forecast', true); api.forecast(well.well_name).then(r => { setForecast(r); return api.history(input.well_id).then(setHistory) }).catch(report).finally(() => loading('forecast', false)) }
  const runRisk = () => { if (!well) return; setError(''); setRisk(null); loading('risk', true); api.risk(well.well_name).then(setRisk).catch(report).finally(() => loading('risk', false)) }
  const visualizeRecommendation = () => { if (optimization) setTwinMode('optimized') }
  const twinOptimization = toTwinOptimization(optimization)

  return <main><header><div><span className="eyebrow">CSS / SRP operations console</span><h1>Baghewala Well Digital Twin</h1><p>Synthetic baseline hackathon demonstrator - not for field operations</p></div><div className="status"><i /> API integration layer</div></header>{error && <div className="error-banner" role="alert"><strong>Request failed</strong><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError('')}>x</button></div>}<WellSelector wells={wells} value={selectedId} loading={busy.wells} onChange={setSelectedId} /><div className="workspace"><aside><WellConditions well={well} loading={busy.well} /><CssControls values={input} errors={fieldErrors} update={update} /><SrpControls values={input} errors={fieldErrors} update={update} /></aside><div className="main-column"><section className="twin-mode-toggle" aria-label="Digital twin visualization mode"><button className={twinMode === 'current' ? 'active' : ''} type="button" onClick={() => setTwinMode('current')}>Current</button><button className={twinMode === 'optimized' ? 'active' : ''} type="button" onClick={() => setTwinMode('optimized')} disabled={!twinOptimization}>Recommended</button></section><DigitalTwin well={well} simulation={simulation?.simulation ?? null} currentInput={input} optimization={twinOptimization} risk={risk?.risks ?? null} mode={twinMode} /><SimulationPanel values={input} errors={fieldErrors} loading={busy.simulation} disabled={!selectedId} update={update} onSubmit={runSimulation} /></div></div><PredictionDisplay result={simulation} /><NextDayForecast currentProduction={currentProductionFromOptimization(optimization)} result={forecast} loading={busy.forecast} disabled={!well?.well_name.startsWith('BGH-')} onRun={runForecast} /><RiskAssessment result={risk} loading={busy.risk} disabled={!well?.well_name.startsWith('BGH-')} onRun={runRisk} /><OptimizationPanel current={input} result={optimization} loading={busy.optimization} disabled={!selectedId} onRun={runOptimization} onVisualize={visualizeRecommendation} /><HistoryPanel history={history} loading={busy.history} /></main>
}

function toTwinOptimization(result: OptimizationResponse | null): DigitalTwinProps['optimization'] {
  if (!result) return null
  const parameters = result.recommendedParameters
  const keys = ['steam_volume', 'steam_injection_pressure', 'soak_time', 'production_cutoff', 'stroke_length', 'rpm_or_spm', 'vfd_frequency'] as const
  if (!keys.every(key => typeof parameters[key] === 'number')) return null
  return {
    recommendedParameters: parameters as NonNullable<DigitalTwinProps['optimization']>['recommendedParameters'],
    predictions: {
      current: result.predictions.current,
      recommended: result.predictions.recommended,
    },
  }
}
