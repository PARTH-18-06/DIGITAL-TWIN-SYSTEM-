export interface Well {
  id: string
  well_name: string
  reservoir_temperature: number | null
  reservoir_pressure: number | null
  oil_properties: Record<string, unknown>
  created_at: string | null
}

export interface SimulationInput {
  well_id: string
  temperature: number
  pressure: number
  viscosity: number
  rpm_or_spm: number
  steam_injection_pressure: number
  steam_volume: number
  soak_time: number
  production_cutoff: number
  stroke_length: number
  vfd_frequency: number
  fluid_level: number
  water_cut: number
  oil_flow_rate?: number
  valve_opening?: number
}

export interface SimulationResponse {
  well_id: string
  simulation: {
    flow_speed: number
    flow_direction: 'forward' | 'reverse' | 'stalled'
    temperature_color_value: number
    pressure_intensity: number
    pump_stroke_speed: number
    rod_movement_behavior: 'normal' | 'floating_risk' | 'impact_risk'
    warnings: string[]
    risk_scores: { rod_floating_risk: number; impact_loading_risk: number; pump_failure_risk: number }
  }
  raw_metrics: { viscosity_estimate: number; pump_displacement: number }
}

export interface OptimizationResponse {
  well_id: string
  recommendedParameters: Partial<Pick<SimulationInput, 'steam_volume' | 'steam_injection_pressure' | 'soak_time' | 'production_cutoff' | 'stroke_length' | 'rpm_or_spm' | 'vfd_frequency'>>
  predictions: {
    current: Record<string, number>
    recommended: Record<string, number>
    current_score: number
    recommended_score: number
    predicted_oil_flow_rate: number
    confidence: string
    objective_weights: Record<string, number>
    optimizer: Record<string, unknown>
  }
}

export interface ForecastResponse {
  well_id: string
  forecast_date: string
  predicted_oil_production: number
  history_window_days: number
  model_version: string
  validation_summary: { chronological_r2: number; held_out_well_r2: number }
  dataset_type: string
  category_basis: string
  field_validated: boolean
  history_source: string
  persistence_status: string
  input_snapshot: Record<string, unknown>
}

export interface RiskItem {
  risk_score: number
  category: 'LOW' | 'MEDIUM' | 'HIGH'
  classifier_probability: number | null
}

export interface RiskResponse {
  well_id: string
  risks: {
    rod_floating: RiskItem
    impact_loading: RiskItem
    pump_unsetting: RiskItem
    rod_failure: RiskItem
  }
  category_basis: string
  field_validated: boolean
  model_version: string
  validation_summary: Record<string, unknown>
}

export interface SimulationRun { id: string; well_id: string; input_parameters: SimulationInput; simulation_output: SimulationResponse; created_at: string }
export interface OptimizationRun { id: string; well_id: string; current_parameters: SimulationInput & { oil_api?: number }; recommended_parameters: OptimizationResponse['recommendedParameters']; predicted_results: OptimizationResponse['predictions']; created_at: string }
export interface ForecastRun { id: string; well_id: string; forecast_date: string; input_snapshot: Record<string, unknown>; predicted_oil_production: number; risk_output: Record<string, unknown>; model_metadata: Record<string, unknown>; created_at: string }
export interface HistoryResponse { well_id: string; simulation_runs: SimulationRun[]; optimization_runs: OptimizationRun[]; forecast_runs: ForecastRun[] }
export type FieldErrors = Partial<Record<keyof SimulationInput, string>>
