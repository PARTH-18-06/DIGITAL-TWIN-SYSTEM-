export type RiskCategory = 'LOW' | 'MEDIUM' | 'HIGH'

export type RiskItemLike = {
  risk_score: number
  category: RiskCategory
}

export type RiskSummary = {
  score: number | null
  category: RiskCategory | null
  statusLabel: string
  scoreLabel: string
  cssClass: 'unavailable' | Lowercase<RiskCategory>
}

export type VersionSnapshot = {
  selectionVersion: number
  operatingVersion: number
}

export type RequestKey = 'simulation' | 'optimization' | 'forecast' | 'risk'

export type RequestToken = VersionSnapshot & {
  key: RequestKey
  id: number
}

export type RequestLifecycleState = {
  nextRequestId: number
  activeRequestIds: Record<RequestKey, number>
}

const CATEGORY_RANK: Record<RiskCategory, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
}

export function isVersionCurrent(snapshot: VersionSnapshot, current: VersionSnapshot) {
  return snapshot.selectionVersion === current.selectionVersion
    && snapshot.operatingVersion === current.operatingVersion
}

export function createRequestLifecycleState(): RequestLifecycleState {
  return {
    nextRequestId: 0,
    activeRequestIds: {
      simulation: 0,
      optimization: 0,
      forecast: 0,
      risk: 0,
    },
  }
}

export function beginRequest(
  lifecycle: RequestLifecycleState,
  key: RequestKey,
  versions: VersionSnapshot,
): RequestToken {
  const id = lifecycle.nextRequestId + 1
  lifecycle.nextRequestId = id
  lifecycle.activeRequestIds[key] = id
  return { ...versions, key, id }
}

export function isRequestCurrent(
  lifecycle: RequestLifecycleState,
  token: RequestToken,
  current: VersionSnapshot,
) {
  return lifecycle.activeRequestIds[token.key] === token.id
    && isVersionCurrent(token, current)
}

export function adoptCurrentOperatingVersion(
  lifecycle: RequestLifecycleState,
  token: RequestToken,
  current: VersionSnapshot,
) {
  if (
    lifecycle.activeRequestIds[token.key] === token.id
    && token.selectionVersion === current.selectionVersion
  ) {
    token.operatingVersion = current.operatingVersion
  }
}

export function summarizeAssessedRisk(risk: Record<string, RiskItemLike> | null | undefined): RiskSummary {
  const items = Object.values(risk ?? {}).filter(isValidRiskItem)
  if (items.length === 0) {
    return {
      score: null,
      category: null,
      statusLabel: 'Risk not assessed',
      scoreLabel: 'Run risk assessment',
      cssClass: 'unavailable',
    }
  }

  const selected = items.reduce((best, item) => {
    const severityDelta = CATEGORY_RANK[item.category] - CATEGORY_RANK[best.category]
    if (severityDelta > 0) return item
    if (severityDelta === 0 && item.risk_score > best.risk_score) return item
    return best
  })

  const score = clamp01(selected.risk_score)
  return {
    score,
    category: selected.category,
    statusLabel: `Highest risk ${selected.category}`,
    scoreLabel: `category score ${Math.round(score * 100)}%`,
    cssClass: selected.category.toLowerCase() as Lowercase<RiskCategory>,
  }
}

export function optimizerTerminationNotice(optimizer: Record<string, unknown> | undefined) {
  if (!optimizer) return null
  const success = optimizer.success
  const message = typeof optimizer.message === 'string' ? optimizer.message : ''
  const maxiter = typeof optimizer.maxiter === 'number' ? optimizer.maxiter : null
  const reachedLimit = success === false && /maximum number of iterations/i.test(message)
  const method = typeof optimizer.method === 'string' ? optimizer.method : 'optimizer'

  if (reachedLimit) {
    return {
      tone: 'warning' as const,
      title: 'Search budget reached',
      message: `The ${method} search reached its${maxiter === null ? '' : ` ${maxiter}-iteration`} limit. Treat this as the best candidate found within the demo search budget, not as a confirmed converged optimum.`,
    }
  }

  if (success === false) {
    return {
      tone: 'warning' as const,
      title: 'Optimizer did not report convergence',
      message: message || 'The optimizer returned a candidate, but did not report successful convergence.',
    }
  }

  if (success === true) {
    return {
      tone: 'ok' as const,
      title: 'Optimizer completed',
      message: message || 'The optimizer reported successful termination for this bounded search.',
    }
  }

  return null
}

function isValidRiskItem(item: RiskItemLike | undefined): item is RiskItemLike {
  return Boolean(item)
    && typeof item?.risk_score === 'number'
    && Number.isFinite(item.risk_score)
    && item.category in CATEGORY_RANK
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}
