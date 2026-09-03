from types import SimpleNamespace

import numpy as np

from app.ml import optimizer
from app.ml.features import CONTROLLABLE_FEATURES, TARGET_COLUMNS


VALID_STATE = {
    "well_id": "demo",
    "temperature": 80,
    "pressure": 4.2,
    "viscosity": 1000,
    "oil_api": 18.5,
    "rpm_or_spm": 8,
    "steam_injection_pressure": 20,
    "steam_volume": 900,
    "soak_time": 24,
    "production_cutoff": 10,
    "stroke_length": 55,
    "vfd_frequency": 40,
    "fluid_level": 40,
    "water_cut": 0.15,
}


class FakeModel:
    def __init__(self, value: float):
        self.value = value

    def predict(self, vector):
        return np.array([self.value + float(vector[0][0]) * 0.001])


def test_optimizer_response_shape_and_bounds(monkeypatch):
    monkeypatch.setattr(
        optimizer,
        "_load_models",
        lambda: {target: FakeModel(index + 1) for index, target in enumerate(TARGET_COLUMNS)},
    )

    def fake_differential_evolution(objective, bounds, **kwargs):
        midpoint = np.array([(lower + upper) / 2 for lower, upper in bounds])
        objective(midpoint)
        return SimpleNamespace(x=midpoint, success=True, message="test optimizer")

    monkeypatch.setattr(optimizer, "differential_evolution", fake_differential_evolution)

    result = optimizer.recommend_parameters("demo", VALID_STATE)

    assert result["well_id"] == "demo"
    assert set(result["recommendedParameters"]) == {
        "steam_volume",
        "steam_injection_pressure",
        "soak_time",
        "production_cutoff",
        "stroke_length",
        "rpm_or_spm",
        "vfd_frequency",
    }
    assert {"current", "recommended", "current_score", "recommended_score"} <= set(result["predictions"])

    for feature, bounds in zip(CONTROLLABLE_FEATURES, optimizer.CONTROL_BOUNDS, strict=True):
        api_field = optimizer.FEATURE_TO_API_FIELD[feature]
        value = result["recommendedParameters"][api_field]
        assert bounds[0] <= value <= bounds[1]
