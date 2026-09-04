import type { FieldErrors, ForecastResponse, HistoryResponse, OptimizationResponse, RiskResponse, SimulationInput, SimulationResponse, Well } from './types'

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL
const BASE_URL = (configuredBaseUrl || (import.meta.env.DEV ? 'http://127.0.0.1:8000' : '')).replace(/\/$/, '')

export class ApiError extends Error {
  constructor(message: string, public status: number, public fieldErrors: FieldErrors = {}) { super(message) }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  if (!BASE_URL) throw new ApiError('VITE_API_BASE_URL is required in production.', 0)
  try {
    const response = await fetch(`${BASE_URL}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...options?.headers } })
    if (!response.ok) {
      const body = await response.json().catch(() => ({ detail: response.statusText }))
      const details = Array.isArray(body.detail) ? body.detail : []
      const fields = Object.fromEntries(details.filter((item: { loc?: string[] }) => item.loc?.[0] === 'body').map((item: { loc: string[]; msg: string }) => [item.loc.at(-1), item.msg]))
      const message = typeof body.detail === 'string' ? body.detail : details.map((item: { loc?: string[]; msg: string }) => `${item.loc?.at(-1)}: ${item.msg}`).join('; ') || `Request failed (${response.status})`
      throw new ApiError(message, response.status, fields)
    }
    return response.json() as Promise<T>
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(error instanceof Error ? `Backend unreachable: ${error.message}` : 'Backend unreachable', 0)
  }
}

export const api = {
  wells: () => request<Well[]>('/api/wells'),
  well: (id: string) => request<Well>(`/api/wells/${encodeURIComponent(id)}`),
  simulate: (input: SimulationInput) => request<SimulationResponse>('/api/simulation', { method: 'POST', body: JSON.stringify(input) }),
  optimize: (input: SimulationInput) => request<OptimizationResponse>('/api/optimization', { method: 'POST', body: JSON.stringify(input) }),
  forecast: (wellId: string) => request<ForecastResponse>('/api/forecast/next-day', { method: 'POST', body: JSON.stringify({ well_id: wellId }) }),
  risk: (input: SimulationInput | string) => request<RiskResponse>('/api/risk', {
    method: 'POST',
    body: JSON.stringify(typeof input === 'string' ? { well_id: input } : input),
  }),
  history: (id: string) => request<HistoryResponse>(`/api/history/${encodeURIComponent(id)}`),
}
