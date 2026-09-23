import assert from 'node:assert/strict'
import test from 'node:test'

import {
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
