import { useEffect, useRef, useState } from 'react'
import { api, ApiError } from './api/client'
import { DEFAULT_INPUT, mergeUneditedInput, resolveWellInput } from './api/wellInput'
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

export default function App() {
  const [wells, setWells] = useState<Well[]>([]), [selectedId, setSelectedId] = useState(''), [well, setWell] = useState<Well | null>(null)
  const [input, setInput] = useState(DEFAULT_INPUT), [simulation, setSimulation] = useState<SimulationResponse | null>(null), [optimization, setOptimization] = useState<OptimizationResponse | null>(null), [history, setHistory] = useState<HistoryResponse | null>(null)
  const [forecast, setForecast] = useState<ForecastResponse | null>(null), [risk, setRisk] = useState<RiskResponse | null>(null), [twinMode, setTwinMode] = useState<TwinMode>('current')
  const [busy, setBusy] = useState({ wells: true, well: false, simulation: false, optimization: false, forecast: false, risk: false, history: false }), [error, setError] = useState(''), [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const loading = (key: keyof typeof busy, value: boolean) => setBusy(old => ({ ...old, [key]: value }))
  const report = (e: unknown) => { const err = e instanceof ApiError ? e : new ApiError('Unexpected error', 0); setError(err.message); setFieldErrors(err.fieldErrors) }
  const selectionVersion = useRef(0)
  const operatingVersion = useRef(0)
  const editedFields = useRef(new Set<keyof SimulationInput>())
  const needsObservation = useRef(true)
  const selectWell = (id: string) => { if (id !== selectedId) { selectionVersion.current += 1; setSelectedId(id) } }

  useEffect(() => {
    let active = true
    api.wells().then(data => { if (active) { setWells(data); if (data[0]) setSelectedId(data[0].id) } })
      .catch(e => { if (active) report(e) }).finally(() => { if (active) loading('wells', false) })
    return () => { active = false }
  }, [])
  useEffect(() => {
    let active = true
    const version = ++selectionVersion.current
    editedFields.current = new Set()
    needsObservation.current = true
    setError(''); setFieldErrors({}); setWell(null); setHistory(null); setSimulation(null); setOptimization(null); setForecast(null); setRisk(null); setTwinMode('current')
    // Always reset, including optional fields and edits belonging to another well.
    setInput({ ...DEFAULT_INPUT, well_id: selectedId })
    setBusy(old => ({ ...old, well: Boolean(selectedId), history: Boolean(selectedId), simulation: false, optimization: false, forecast: false, risk: false }))
    if (selectedId) {
      Promise.allSettled([api.well(selectedId), api.history(selectedId)]).then(([wellResult, historyResult]) => {
        if (!active || version !== selectionVersion.current) return
        const selectedHistory = historyResult.status === 'fulfilled' ? historyResult.value : null
        setHistory(selectedHistory)
        if (wellResult.status === 'fulfilled') {
          setWell(wellResult.value)
          const prefill = resolveWellInput(wellResult.value, selectedHistory)
          needsObservation.current = !prefill.hasOperatingParameters
          const edits = new Set(editedFields.current)
          setInput(current => mergeUneditedInput(current, prefill.input, edits))
        } else report(wellResult.reason)
        if (historyResult.status === 'rejected') report(historyResult.reason)
        loading('well', false); loading('history', false)
      })
    }
    return () => { active = false; selectionVersion.current += 1 }
  }, [selectedId])
  const update = (key: keyof SimulationInput, value: number) => { editedFields.current.add(key); setInput(v => ({ ...v, [key]: value })); setFieldErrors(v => ({ ...v, [key]: undefined })) }
  const runAction = (key: 'simulation' | 'optimization' | 'forecast' | 'risk', action: (isCurrent: () => boolean) => Promise<void>) => {
    const version = selectionVersion.current
    const inputVersion = operatingVersion.current
    const isCurrent = () => version === selectionVersion.current && (key === 'forecast' || inputVersion === operatingVersion.current)
    setError(''); setFieldErrors({}); loading(key, true)
    void action(isCurrent).catch(e => { if (isCurrent()) report(e) }).finally(() => { if (isCurrent()) loading(key, false) })
  }
  const refreshHistory = async (isCurrent: () => boolean) => {
    const records = await api.history(input.well_id)
    if (isCurrent()) setHistory(records)
  }
  const runSimulation = () => runAction('simulation', async isCurrent => {
    setTwinMode('current')
    const result = await api.simulate(input)
    if (!isCurrent()) return
    setSimulation(result)
    await refreshHistory(isCurrent)
  })
  const runOptimization = () => runAction('optimization', async isCurrent => {
    setOptimization(null)
    const result = await api.optimize(input)
    if (!isCurrent()) return
    setOptimization(result)
    await refreshHistory(isCurrent)
  })
  const runForecast = () => {
    if (!well) return
    runAction('forecast', async isCurrent => {
      setForecast(null)
      const result = await api.forecast(well.well_name)
      if (!isCurrent()) return
      setForecast(result)
      // No automatic forecast POST on selection. A manually requested forecast
      // can supply missing observations without overwriting any user edits.
      if (needsObservation.current) {
        const prefill = resolveWellInput(well, null, result)
        needsObservation.current = !prefill.hasOperatingParameters
        const edits = new Set(editedFields.current)
        setInput(current => mergeUneditedInput(current, prefill.input, edits))
        if (prefill.hasOperatingParameters) {
          // Results computed for the previous defaults must not describe the
          // newly loaded operating state, including requests still in flight.
          operatingVersion.current += 1
          setSimulation(null); setOptimization(null); setRisk(null); setTwinMode('current')
          setBusy(old => ({ ...old, simulation: false, optimization: false, risk: false }))
        }
      }
      await refreshHistory(isCurrent)
    })
  }
  const runRisk = () => {
    if (!well) return
    runAction('risk', async isCurrent => { setRisk(null); const result = await api.risk(input); if (isCurrent()) setRisk(result) })
  }
  const selectingWell = busy.well || busy.history || input.well_id !== selectedId
  const visualizeRecommendation = () => { if (optimization) setTwinMode('optimized') }
  const twinOptimization = toTwinOptimization(optimization)

  return <main>
    <header><div><span className="eyebrow">CSS / SRP operations console</span><h1>Baghewala Well Digital Twin</h1><p>Predict. Optimize. Recover</p></div><div className="status"><i /> API integration layer</div></header>
    {error && <div className="error-banner" role="alert"><strong>Request failed</strong><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError('')}>x</button></div>}
    <WellSelector wells={wells} value={selectedId} loading={busy.wells} onChange={selectWell} />
    <div className="workspace">
      <aside><WellConditions well={well} loading={busy.well} /><CssControls values={input} errors={fieldErrors} update={update} /><SrpControls values={input} errors={fieldErrors} update={update} /></aside>
      <div className="main-column">
        <section className="twin-mode-toggle" aria-label="Digital twin visualization mode"><button className={twinMode === 'current' ? 'active' : ''} type="button" onClick={() => setTwinMode('current')}>Current</button><button className={twinMode === 'optimized' ? 'active' : ''} type="button" onClick={() => setTwinMode('optimized')} disabled={!twinOptimization}>Recommended</button></section>
        <DigitalTwin well={well} simulation={simulation?.simulation ?? null} currentInput={input} optimization={twinOptimization} risk={risk?.risks ?? null} mode={twinMode} />
        <SimulationPanel values={input} errors={fieldErrors} loading={busy.simulation} disabled={!selectedId || selectingWell} update={update} onSubmit={runSimulation} />
      </div>
    </div>
    <PredictionDisplay result={simulation} />
    <NextDayForecast currentProduction={currentProductionFromOptimization(optimization)} result={forecast} loading={busy.forecast} disabled={selectingWell || !well?.well_name.startsWith('BGH-')} onRun={runForecast} />
    <RiskAssessment result={risk} loading={busy.risk} disabled={selectingWell || !well?.well_name.startsWith('BGH-')} onRun={runRisk} />
    <OptimizationPanel current={input} result={optimization} loading={busy.optimization} disabled={!selectedId || selectingWell} onRun={runOptimization} onVisualize={visualizeRecommendation} />
    <HistoryPanel history={history} loading={busy.history} />
  </main>
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
