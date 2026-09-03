from app.simulation.physics import (
    DATA_FITTED_VISCOSITY_AT_REF_TEMP,
    VISCOSITY_TEMP_COEFFICIENT,
    estimate_pump_failure_risk,
    estimate_rod_floating_risk,
    estimate_viscosity_effect,
    run_stage1_simulation,
)


SAMPLE = {"well_id": "demo", "temperature": 80, "pressure": 4.2,
          "oil_flow_rate": 30, "viscosity": 1000, "rpm_or_spm": 10,
          "valve_opening": 75, "steam_injection_pressure": 20,
          "steam_volume": 900, "soak_time": 24, "production_cutoff": 10,
          "stroke_length": 55, "vfd_frequency": 40, "fluid_level": 40,
          "water_cut": 0.15}


def test_temperature_reduces_viscosity():
    assert estimate_viscosity_effect(1000, 80) < estimate_viscosity_effect(1000, 48)


def test_viscosity_uses_dataset_fitted_temperature_coefficient():
    assert VISCOSITY_TEMP_COEFFICIENT == 0.04217030207890511
    assert round(DATA_FITTED_VISCOSITY_AT_REF_TEMP, 4) == 10005.7235
    assert round(estimate_viscosity_effect(1000, 80), 6) == 259.382969


def test_risk_estimators_remain_calibrated_and_clamped():
    rod_risk = estimate_rod_floating_risk(spm=10, stroke_length=55, fluid_level=0.4)
    failure_risk = estimate_pump_failure_risk(rod_risk, impact_loading_risk=0.25, pressure_stress_factor=0.8)
    assert round(rod_risk, 6) == 0.238802
    assert 0 <= failure_risk <= 1


def test_risk_is_clamped():
    assert 0 <= estimate_pump_failure_risk(10, 10, 10) <= 1


def test_payload_shape_and_ranges():
    result = run_stage1_simulation(SAMPLE)
    assert result["well_id"] == "demo"
    assert 0 <= result["simulation"]["temperature_color_value"] <= 1
    assert 0 <= result["simulation"]["risk_scores"]["pump_failure_risk"] <= 1


def test_typical_injection_pressure_drives_forward_flow():
    result = run_stage1_simulation(SAMPLE)
    assert result["simulation"]["flow_direction"] == "forward"
    assert result["simulation"]["flow_speed"] > 0


def test_reservoir_pressure_above_injection_pressure_triggers_reverse_flow():
    # Deliberately anomalous at the physics-function level. The API schema's
    # current data-backed ranges do not overlap, so this cannot occur through a
    # validated request unless those ranges are revised in the future.
    result = run_stage1_simulation({**SAMPLE, "pressure": 21, "steam_injection_pressure": 20})
    assert result["simulation"]["flow_direction"] == "reverse"
    assert result["simulation"]["flow_speed"] < 0


def test_closed_valve_stalls_flow():
    result = run_stage1_simulation({**SAMPLE, "valve_opening": 0})
    assert result["simulation"]["flow_direction"] == "stalled"
    assert result["simulation"]["flow_speed"] == 0
