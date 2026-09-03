from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class SimulationInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    well_id: str = Field(
        min_length=1,
        max_length=128,
        description="Existing well identifier; accepts either wells.id UUID or wells.well_name such as BGH-001.",
    )
    # Bounds are the synthetic dataset extrema extended outward by 5%.
    # The buffer avoids treating one synthetic sample's min/max as the complete
    # physical operating envelope. These are data-backed validation bounds, not
    # equipment safety limits; revise when authoritative field limits are known.
    temperature: float = Field(ge=44.289, le=152.25)
    pressure: float = Field(ge=2.6315, le=5.649)
    viscosity: float = Field(ge=120.6595, le=13424.9535)
    rpm_or_spm: float = Field(ge=3.8, le=11.55)
    steam_injection_pressure: float = Field(ge=9.5665, le=29.4)
    steam_volume: float = Field(ge=475.0, le=1473.0135)
    soak_time: float = Field(ge=11.4, le=51.324)
    production_cutoff: float = Field(ge=5.7, le=20.496)
    stroke_length: float | None = Field(default=None, ge=38.0, le=73.5)
    vfd_frequency: float | None = Field(default=None, ge=23.75, le=52.5)
    fluid_level: float | None = Field(default=None, ge=24.0255, le=54.18)
    water_cut: float | None = Field(default=None, ge=0.0475, le=0.3318)

    # These fields were in the original API contract but are absent from the
    # supplied dataset. They remain optional and intentionally range-unvalidated
    # pending real data or clarification from the engineering/frontend teams.
    oil_flow_rate: float | None = None
    valve_opening: float | None = None

    @field_validator("temperature", "pressure", "oil_flow_rate", "viscosity", "rpm_or_spm",
                     "valve_opening", "steam_injection_pressure", "steam_volume", "soak_time",
                     "production_cutoff", "stroke_length", "vfd_frequency", "fluid_level",
                     "water_cut")
    @classmethod
    def must_be_finite(cls, value: float | None) -> float | None:
        if value is None:
            return value
        if not float(value) == value or value in (float("inf"), float("-inf")):
            raise ValueError("must be a finite number")
        return value


class RiskScores(BaseModel):
    rod_floating_risk: float = Field(ge=0, le=1)
    impact_loading_risk: float = Field(ge=0, le=1)
    pump_failure_risk: float = Field(ge=0, le=1)


class SimulationResult(BaseModel):
    flow_speed: float
    flow_direction: Literal["forward", "reverse", "stalled"]
    temperature_color_value: float = Field(ge=0, le=1)
    pressure_intensity: float = Field(ge=0, le=1)
    pump_stroke_speed: float
    rod_movement_behavior: Literal["normal", "floating_risk", "impact_risk"]
    warnings: list[str]
    risk_scores: RiskScores


class RawMetrics(BaseModel):
    viscosity_estimate: float
    pump_displacement: float


class SimulationResponse(BaseModel):
    well_id: str
    simulation: SimulationResult
    raw_metrics: RawMetrics


class OptimizationResponse(BaseModel):
    well_id: str
    recommendedParameters: dict[str, float]
    predictions: dict[str, Any]


class ForecastRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    well_id: str = Field(
        min_length=1,
        max_length=128,
        description="Existing well identifier; accepts either wells.id UUID or wells.well_name such as BGH-001.",
    )


class ForecastResponse(BaseModel):
    well_id: str
    forecast_date: str
    predicted_oil_production: float
    history_window_days: int
    model_version: str
    validation_summary: dict[str, float]
    dataset_type: str
    category_basis: str
    field_validated: bool
    history_source: str
    input_snapshot: dict[str, Any]
    persistence_status: str


class RiskRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    well_id: str = Field(
        min_length=1,
        max_length=128,
        description="Existing well identifier; accepts either wells.id UUID or wells.well_name such as BGH-001.",
    )
    # Optional live-state fields let the dashboard assess the current form
    # values. If omitted, /api/risk falls back to the latest saved observation
    # for backward-compatible history-based API usage.
    temperature: float | None = Field(default=None, ge=44.289, le=152.25)
    pressure: float | None = Field(default=None, ge=2.6315, le=5.649)
    viscosity: float | None = Field(default=None, ge=120.6595, le=13424.9535)
    rpm_or_spm: float | None = Field(default=None, ge=3.8, le=11.55)
    steam_injection_pressure: float | None = Field(default=None, ge=9.5665, le=29.4)
    steam_volume: float | None = Field(default=None, ge=475.0, le=1473.0135)
    soak_time: float | None = Field(default=None, ge=11.4, le=51.324)
    production_cutoff: float | None = Field(default=None, ge=5.7, le=20.496)
    stroke_length: float | None = Field(default=None, ge=38.0, le=73.5)
    vfd_frequency: float | None = Field(default=None, ge=23.75, le=52.5)
    fluid_level: float | None = Field(default=None, ge=24.0255, le=54.18)
    water_cut: float | None = Field(default=None, ge=0.0475, le=0.3318)
    oil_api: float | None = Field(default=None, ge=0)
    days_since_steam: float | None = Field(default=None, ge=0)
    oil_flow_rate: float | None = None
    valve_opening: float | None = None

    @field_validator("temperature", "pressure", "viscosity", "rpm_or_spm",
                     "steam_injection_pressure", "steam_volume", "soak_time",
                     "production_cutoff", "stroke_length", "vfd_frequency",
                     "fluid_level", "water_cut", "oil_api", "days_since_steam",
                     "oil_flow_rate", "valve_opening")
    @classmethod
    def live_values_must_be_finite(cls, value: float | None) -> float | None:
        if value is None:
            return value
        if not float(value) == value or value in (float("inf"), float("-inf")):
            raise ValueError("must be a finite number")
        return value


class RiskItem(BaseModel):
    risk_score: float = Field(ge=0, le=1)
    category: Literal["LOW", "MEDIUM", "HIGH"]
    classifier_probability: float | None = Field(default=None, ge=0, le=1)


class RiskResponse(BaseModel):
    well_id: str
    risks: dict[str, RiskItem]
    category_basis: str
    field_validated: bool
    model_version: str
    validation_summary: dict[str, Any]


class Well(BaseModel):
    id: str
    well_name: str
    reservoir_temperature: float | None = None
    reservoir_pressure: float | None = None
    oil_properties: dict[str, Any] = Field(default_factory=dict)
    created_at: str | None = None


class HistoryResponse(BaseModel):
    well_id: str
    simulation_runs: list[dict[str, Any]]
    optimization_runs: list[dict[str, Any]]
    forecast_runs: list[dict[str, Any]] = Field(default_factory=list)
