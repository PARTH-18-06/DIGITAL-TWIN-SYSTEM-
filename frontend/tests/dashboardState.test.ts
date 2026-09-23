import assert from 'node:assert/strict'
import test from 'node:test'

import {
  adoptCurrentOperatingVersion,
  beginRequest,
  createRequestLifecycleState,
  isRequestCurrent,
  isVersionCurrent,
  optimizerTerminationNotice,
  summarizeAssessedRisk,
} from '../src/lib/dashboardState.ts'

test('input version changes invalidate old async responses', () => {
  const request = { selectionVersion: 4, operatingVersion: 10 }

  assert.equal(isVersionCurrent(request, { selectionVersion: 4, operatingVersion: 10 }), true)
  assert.equal(isVersionCurrent(request, { selectionVersion: 4, operatingVersion: 11 }), false)
})

test('well selection changes invalidate old async responses', () => {
  const request = { selectionVersion: 4, operatingVersion: 10 }

  assert.equal(isVersionCurrent(request, { selectionVersion: 5, operatingVersion: 10 }), false)
})

test('risk summary prefers highest category over highest numeric score', () => {
  const summary = summarizeAssessedRisk({
    rod_floating: { risk_score: 0.215, category: 'LOW' },
    rod_failure: { risk_score: 0.184, category: 'MEDIUM' },
  })

  assert.equal(summary.category, 'MEDIUM')
  assert.equal(summary.score, 0.184)
  assert.equal(summary.statusLabel, 'Highest risk MEDIUM')
})

test('missing risk data returns explicit unavailable state', () => {
  const summary = summarizeAssessedRisk(null)

  assert.equal(summary.category, null)
  assert.equal(summary.score, null)
  assert.equal(summary.cssClass, 'unavailable')
  assert.match(summary.statusLabel, /not assessed/i)
})

test('optimizer termination notice discloses max-iteration candidates', () => {
  const notice = optimizerTerminationNotice({
    method: 'scipy.optimize.differential_evolution',
    maxiter: 6,
    success: false,
    message: 'Maximum number of iterations has been exceeded.',
  })

  assert.equal(notice?.tone, 'warning')
  assert.match(notice?.message ?? '', /best candidate found/i)
  assert.match(notice?.message ?? '', /not as a confirmed converged optimum/i)
})

test('forecast-driven input hydration can complete and refresh history', async () => {
  const lifecycle = createRequestLifecycleState()
  let versions = { selectionVersion: 1, operatingVersion: 4 }
  const token = beginRequest(lifecycle, 'forecast', versions)
  let forecastResult: string | null = null
  let historyUpdated = false
  let loading = true

  const isCurrent = () => isRequestCurrent(lifecycle, token, versions)

  forecastResult = 'next-day forecast'
  versions = { ...versions, operatingVersion: versions.operatingVersion + 1 }
  adoptCurrentOperatingVersion(lifecycle, token, versions)

  if (isCurrent()) historyUpdated = true
  if (isCurrent()) loading = false

  assert.equal(forecastResult, 'next-day forecast')
  assert.equal(historyUpdated, true)
  assert.equal(loading, false)
})

test('input changes during a request reject stale results and loading updates', async () => {
  const lifecycle = createRequestLifecycleState()
  let versions = { selectionVersion: 1, operatingVersion: 4 }
  const token = beginRequest(lifecycle, 'forecast', versions)
  let forecastResult: string | null = null
  let historyUpdated = false
  let loading = true

  versions = { ...versions, operatingVersion: versions.operatingVersion + 1 }
  loading = false

  const isCurrent = () => isRequestCurrent(lifecycle, token, versions)
  if (isCurrent()) forecastResult = 'stale forecast'
  if (isCurrent()) historyUpdated = true
  if (isCurrent()) loading = false

  assert.equal(forecastResult, null)
  assert.equal(historyUpdated, false)
  assert.equal(loading, false)
})

test('well switching during a request rejects stale results', () => {
  const lifecycle = createRequestLifecycleState()
  let versions = { selectionVersion: 2, operatingVersion: 8 }
  const token = beginRequest(lifecycle, 'optimization', versions)

  versions = {
    selectionVersion: versions.selectionVersion + 1,
    operatingVersion: versions.operatingVersion + 1,
  }

  assert.equal(isRequestCurrent(lifecycle, token, versions), false)
})

test('older request completion cannot interfere with a newer request', () => {
  const lifecycle = createRequestLifecycleState()
  const versions = { selectionVersion: 1, operatingVersion: 4 }
  const older = beginRequest(lifecycle, 'forecast', versions)
  const newer = beginRequest(lifecycle, 'forecast', versions)
  let loading = true
  let result: string | null = null

  if (isRequestCurrent(lifecycle, older, versions)) {
    result = 'older result'
    loading = false
  }

  assert.equal(result, null)
  assert.equal(loading, true)

  if (isRequestCurrent(lifecycle, newer, versions)) {
    result = 'newer result'
    loading = false
  }

  assert.equal(result, 'newer result')
  assert.equal(loading, false)
})

test('async request lifecycle clears only the active self-hydrating forecast', async () => {
  const harness = createLifecycleHarness()
  const staleGate = deferred<void>()
  const currentGate = deferred<void>()
  const stale = harness.run('forecast', async ({ isCurrent }) => {
    await staleGate.promise
    if (isCurrent()) harness.result = 'stale'
  })
  const current = harness.run('forecast', async ({ isCurrent, adoptCurrentOperatingVersion }) => {
    await currentGate.promise
    if (!isCurrent()) return
    harness.result = 'forecast'
    harness.versions.operatingVersion += 1
    adoptCurrentOperatingVersion()
    if (isCurrent()) harness.historyRefreshes += 1
  })

  staleGate.resolve()
  await stale

  assert.equal(harness.result, null)
  assert.equal(harness.busy.forecast, true)

  currentGate.resolve()
  await current

  assert.equal(harness.result, 'forecast')
  assert.equal(harness.historyRefreshes, 1)
  assert.equal(harness.busy.forecast, false)
})

test('async request lifecycle rejects stale input and well-change completions', async () => {
  const inputChange = createLifecycleHarness()
  const staleInput = inputChange.run('simulation', async ({ isCurrent }) => {
    await Promise.resolve()
    if (isCurrent()) inputChange.result = 'simulation'
  })
  inputChange.versions.operatingVersion += 1
  inputChange.busy.simulation = false
  await staleInput

  assert.equal(inputChange.result, null)
  assert.equal(inputChange.busy.simulation, false)

  const wellChange = createLifecycleHarness()
  const staleWell = wellChange.run('risk', async ({ isCurrent }) => {
    await Promise.resolve()
    if (isCurrent()) wellChange.result = 'risk'
  })
  wellChange.versions.selectionVersion += 1
  wellChange.versions.operatingVersion += 1
  wellChange.busy.risk = false
  await staleWell

  assert.equal(wellChange.result, null)
  assert.equal(wellChange.busy.risk, false)
})

function createLifecycleHarness() {
  const lifecycle = createRequestLifecycleState()
  const harness = {
    versions: { selectionVersion: 1, operatingVersion: 4 },
    busy: { simulation: false, optimization: false, forecast: false, risk: false },
    result: null as string | null,
    historyRefreshes: 0,
    async run(
      key: 'simulation' | 'optimization' | 'forecast' | 'risk',
      action: (request: {
        isCurrent: () => boolean
        adoptCurrentOperatingVersion: () => void
      }) => Promise<void>,
    ) {
      const token = beginRequest(lifecycle, key, harness.versions)
      const isCurrent = () => isRequestCurrent(lifecycle, token, harness.versions)
      const adoptCurrentVersion = () => adoptCurrentOperatingVersion(lifecycle, token, harness.versions)
      harness.busy[key] = true
      await action({ isCurrent, adoptCurrentOperatingVersion: adoptCurrentVersion })
      if (isCurrent()) harness.busy[key] = false
    },
  }
  return harness
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}
