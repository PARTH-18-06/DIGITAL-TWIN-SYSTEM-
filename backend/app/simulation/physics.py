"""Stage 1 deterministic physics approximations for the digital twin.

These simplified relationships are data-informed by the authoritative
Baghewala synthetic baseline dataset, but they are still Stage 1 proxies and
must not be treated as calibrated field engineering models.
"""

import math
from typing import Any

EPSILON = 1e-9

# Dataset-informed viscosity fit from baghewala_synthetic_dataset_v1.csv:
# oil_viscosity ~= 10005.7235 * exp(-0.0421703 * (temperature - 48)).
# This replaced the original placeholder k=0.03 because the fitted k differs
# by about 40.6%, above the >20% threshold used for meaningful recalibration.
VISCOSITY_REF_TEMP = 48.0
VISCOSITY_TEMP_COEFFICIENT = 0.04217030207890511
DATA_FITTED_VISCOSITY_AT_REF_TEMP = 10005.723549354014

# Simple affine risk recalibrations against the synthetic baseline. Current
# placeholder MAE -> recalibrated MAE on 15,000 rows:
# rod floating: 0.1994 -> 0.0469; impact loading: 0.0645 -> 0.0446.
# Composite pump failure is calibrated to the average of pump_unsetting_risk
# and rod_failure_risk because the API exposes one composite failure score.
ROD_FLOATING_RISK_SCALE = 0.14832936882091902
ROD_FLOATING_RISK_OFFSET = 0.20717028125584835
IMPACT_LOADING_RISK_SCALE = 0.8234418898639695
IMPACT_LOADING_RISK_OFFSET = -0.013937037298174543
PUMP_FAILURE_RISK_SCALE = 0.459567522728021
PUMP_FAILURE_RISK_OFFSET = 0.03613254806412183


def _clamp(value: float, minimum: float = 0.0, maximum: float = 1.0) -> float:
    return max(minimum, min(maximum, value))


def estimate_viscosity_effect(
    base_viscosity: float,
    temperature: float,
    ref_temp: float = VISCOSITY_REF_TEMP,
    k: float = VISCOSITY_TEMP_COEFFICIENT,
) -> float:
    """Apply the dataset-fitted exponential temperature/viscosity effect."""
    return base_viscosity * math.exp(-k * (temperature - ref_temp))


def estimate_flow_speed(pressure_diff: float, viscosity: float) -> float:
    """Simplified Darcy-style ratio; direction is data-supported but unit-dependent.

    The dataset correlation between oil_production and
    (injection_pressure - reservoir_pressure) / oil_viscosity is 0.776, so this
    remains a useful Stage 1 proxy. It is not a calibrated multiphase-flow
    model and the returned magnitude should be interpreted visually.
    """
    return pressure_diff / max(abs(viscosity), EPSILON)


def estimate_pump_behavior(stroke_length: float, spm: float,
                           efficiency: float = 0.75) -> float:
    """PLACEHOLDER — simple displacement proxy, not an engineering pump model."""
    return stroke_length * spm * efficiency


def estimate_rod_floating_risk(spm: float, stroke_length: float,
                               fluid_level: float) -> float:
    """Dataset-recalibrated proximity to a synthetic critical-speed band."""
    critical_speed = 8.0 + 4.0 * _clamp(stroke_length / 10.0) + 3.0 * (1.0 - _clamp(fluid_level))
    band_width = max(critical_speed * 0.35, EPSILON)
    raw_risk = _clamp(1.0 - abs(spm - critical_speed) / band_width)
    return _clamp(ROD_FLOATING_RISK_OFFSET + ROD_FLOATING_RISK_SCALE * raw_risk)


def estimate_pump_failure_risk(rod_floating_risk: float, impact_loading_risk: float,
                               pressure_stress_factor: float) -> float:
    """Dataset-recalibrated composite proxy; still not an equipment failure model."""
    raw_risk = _clamp(0.4 * rod_floating_risk + 0.35 * impact_loading_risk + 0.25 * pressure_stress_factor)
    return _clamp(PUMP_FAILURE_RISK_OFFSET + PUMP_FAILURE_RISK_SCALE * raw_risk)


def run_stage1_simulation(input_params: dict[str, Any]) -> dict[str, Any]:
    """Orchestrate Stage 1 formulae and return a Three.js-ready payload.

    Several constants are informed by the synthetic baseline dataset, but the
    equations remain simplified visualization proxies rather than a fitted
    reservoir or SRP equipment model.
    """
    temperature = float(input_params["temperature"])
    pressure = float(input_params["pressure"])
    steam_pressure = float(input_params["steam_injection_pressure"])
    spm = float(input_params["rpm_or_spm"])
    # Unvalidated optional legacy values use neutral defaults when omitted.
    valve_fraction = float(input_params.get("valve_opening") if input_params.get("valve_opening") is not None else 100.0) / 100.0

    viscosity = estimate_viscosity_effect(float(input_params["viscosity"]), temperature)
    # PLACEHOLDER — treat injection pressure above reservoir pressure as the
    # positive driving differential for forward flow. This sign convention
    # represents steam injection driving fluid toward production; it is not a
    # calibrated multiphase-flow model. Reservoir pressure above injection
    # pressure remains an anomalous reverse-flow case.
    pressure_diff = steam_pressure - pressure
    flow_speed = estimate_flow_speed(pressure_diff, viscosity) * valve_fraction

    # Inputs do not yet define stroke length or fluid level. These explicit,
    # dimensionless proxies must be replaced once those field measurements exist.
    oil_flow = float(input_params.get("oil_flow_rate") or 0.0)
    stroke_length = input_params.get("stroke_length")
    fluid_level = input_params.get("fluid_level")
    stroke_length_proxy = (float(stroke_length) if stroke_length is not None else
                           _clamp(oil_flow / max(float(input_params["production_cutoff"]), EPSILON), 0.1, 2.0))
    fluid_level_proxy = (float(fluid_level) / 100.0 if fluid_level is not None else
                         _clamp(float(input_params["steam_volume"]) /
                                max(float(input_params["steam_volume"]) + oil_flow, EPSILON)))
    pump_displacement = estimate_pump_behavior(stroke_length_proxy, spm)
    rod_risk = estimate_rod_floating_risk(spm, stroke_length_proxy, fluid_level_proxy)
    raw_impact_risk = _clamp((spm / 20.0) * (1.0 - fluid_level_proxy))
    impact_risk = _clamp(IMPACT_LOADING_RISK_OFFSET + IMPACT_LOADING_RISK_SCALE * raw_impact_risk)
    pressure_stress = _clamp(abs(pressure_diff) / max(pressure, steam_pressure, EPSILON))
    failure_risk = estimate_pump_failure_risk(rod_risk, impact_risk, pressure_stress)

    flow_direction = "stalled" if abs(flow_speed) < EPSILON else ("forward" if flow_speed > 0 else "reverse")
    behavior = "impact_risk" if impact_risk >= 0.65 else ("floating_risk" if rod_risk >= 0.65 else "normal")
    warnings: list[str] = []
    if flow_direction == "reverse": warnings.append("Reverse flow predicted by placeholder pressure relationship.")
    if flow_direction == "stalled": warnings.append("Flow is stalled under the placeholder model.")
    if rod_risk >= 0.65: warnings.append("Elevated rod-floating risk (placeholder estimate).")
    if impact_risk >= 0.65: warnings.append("Elevated impact-loading risk (placeholder estimate).")
    if failure_risk >= 0.65: warnings.append("Elevated composite pump-failure risk (placeholder estimate).")

    return {
        "well_id": input_params["well_id"],
        "simulation": {
            "flow_speed": round(flow_speed, 6),
            "flow_direction": flow_direction,
            "temperature_color_value": round(_clamp((temperature - 20.0) / 180.0), 6),
            "pressure_intensity": round(_clamp(pressure / max(pressure, steam_pressure, 1.0)), 6),
            "pump_stroke_speed": round(spm, 6),
            "rod_movement_behavior": behavior,
            "warnings": warnings,
            "risk_scores": {"rod_floating_risk": round(rod_risk, 6),
                            "impact_loading_risk": round(impact_risk, 6),
                            "pump_failure_risk": round(failure_risk, 6)},
        },
        "raw_metrics": {"viscosity_estimate": round(viscosity, 6),
                        "pump_displacement": round(pump_displacement, 6)},
    }
