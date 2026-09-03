"""Runtime XGBoost inference and bounded parameter optimization."""

from __future__ import annotations

from functools import lru_cache
import json
from pathlib import Path
from typing import Any

import joblib
import numpy as np
from scipy.optimize import differential_evolution

from app.ml.features import CONTROLLABLE_FEATURES, FEATURE_COLUMNS, FEATURE_TO_API_FIELD, TARGET_COLUMNS
from app.schemas.models import SimulationInput


MODEL_DIR = Path(__file__).resolve().parent / "models"

# Tunable objective weights. Production adds value; steam-oil ratio and energy
# cost subtract value. Risk receives the highest weight because the demo should
# prefer safer operating regions over marginal production gains.
PRODUCTION_WEIGHT = 1.0
ENERGY_PER_BARREL_WEIGHT = 2.0
STEAM_OIL_RATIO_WEIGHT = 1.0
AVG_RISK_WEIGHT = 5.0

# Differential evolution is bounded and gradient-free, which fits model-backed
# black-box optimization. These caps keep live-demo latency reasonable.
OPTIMIZER_MAXITER = 6
OPTIMIZER_POPSIZE = 4
OPTIMIZER_SEED = 42


class ModelArtifactsMissing(RuntimeError):
    """Raised when the app is asked to optimize before models are trained."""


def _field_bounds(feature_name: str) -> tuple[float, float]:
    api_field = FEATURE_TO_API_FIELD[feature_name]
    field_info = SimulationInput.model_fields[api_field]
    lower = upper = None
    for item in field_info.metadata:
        lower = getattr(item, "ge", lower)
        upper = getattr(item, "le", upper)
    if lower is None or upper is None:
        raise ValueError(f"No numeric validation bounds found for {api_field}.")
    return float(lower), float(upper)


CONTROL_BOUNDS = tuple(_field_bounds(name) for name in CONTROLLABLE_FEATURES)


@lru_cache(maxsize=1)
def _load_models() -> dict[str, Any]:
    feature_path = MODEL_DIR / "feature_order.json"
    if not feature_path.exists():
        raise ModelArtifactsMissing("Missing feature_order.json. Run python app/ml/train_models.py first.")
    metadata = json.loads(feature_path.read_text(encoding="utf-8"))
    if metadata.get("feature_order") != FEATURE_COLUMNS:
        raise ModelArtifactsMissing("feature_order.json does not match the runtime feature order.")

    models = {}
    missing = []
    for target in TARGET_COLUMNS:
        model_path = MODEL_DIR / f"{target}.joblib"
        if not model_path.exists():
            missing.append(str(model_path))
            continue
        models[target] = joblib.load(model_path)
    if missing:
        raise ModelArtifactsMissing("Missing trained model file(s): " + ", ".join(missing))
    return models


def _feature_vector(state: dict[str, float]) -> np.ndarray:
    return np.array([[float(state[column]) for column in FEATURE_COLUMNS]], dtype=float)


def _predict(state: dict[str, float]) -> dict[str, float]:
    vector = _feature_vector(state)
    predictions = {
        target: float(model.predict(vector)[0])
        for target, model in _load_models().items()
    }
    for risk_target in ("rod_floating_risk", "impact_loading_risk", "pump_unsetting_risk", "rod_failure_risk"):
        predictions[risk_target] = float(np.clip(predictions[risk_target], 0.0, 1.0))
    return predictions


def _score(predictions: dict[str, float]) -> float:
    avg_risk = float(
        np.mean(
            [
                predictions["rod_floating_risk"],
                predictions["impact_loading_risk"],
                predictions["pump_unsetting_risk"],
                predictions["rod_failure_risk"],
            ]
        )
    )
    return (
        PRODUCTION_WEIGHT * predictions["oil_production"]
        - ENERGY_PER_BARREL_WEIGHT * predictions["energy_per_barrel"]
        - STEAM_OIL_RATIO_WEIGHT * predictions["steam_oil_ratio"]
        - AVG_RISK_WEIGHT * avg_risk
    )


def _build_feature_state(current_state: dict[str, Any]) -> dict[str, float]:
    state: dict[str, float] = {}
    missing = []
    for feature in FEATURE_COLUMNS:
        if feature == "oil_api":
            value = current_state.get("oil_api")
        else:
            value = current_state.get(FEATURE_TO_API_FIELD[feature])
        if value is None:
            missing.append(feature)
            continue
        state[feature] = float(value)
    if missing:
        raise ValueError("Missing required optimizer feature(s): " + ", ".join(missing))
    return state


def _to_api_recommendations(feature_state: dict[str, float]) -> dict[str, float]:
    return {
        FEATURE_TO_API_FIELD[feature]: round(float(feature_state[feature]), 6)
        for feature in CONTROLLABLE_FEATURES
    }


def _rounded_predictions(predictions: dict[str, float]) -> dict[str, float]:
    return {target: round(float(predictions[target]), 6) for target in TARGET_COLUMNS}


def predict_outputs(current_state: dict[str, Any]) -> dict[str, float]:
    """Predict the existing Stage 2 continuous targets for one current state."""
    return _rounded_predictions(_predict(_build_feature_state(current_state)))


def recommend_parameters(well_id: str, current_state: dict[str, Any]) -> dict[str, Any]:
    base_state = _build_feature_state(current_state)
    current_predictions = _predict(base_state)

    def objective(values: np.ndarray) -> float:
        candidate = dict(base_state)
        for feature, value in zip(CONTROLLABLE_FEATURES, values, strict=True):
            candidate[feature] = float(value)
        return -_score(_predict(candidate))

    result = differential_evolution(
        objective,
        bounds=CONTROL_BOUNDS,
        maxiter=OPTIMIZER_MAXITER,
        popsize=OPTIMIZER_POPSIZE,
        seed=OPTIMIZER_SEED,
        polish=False,
        tol=0.01,
        workers=1,
    )

    recommended_state = dict(base_state)
    for feature, value in zip(CONTROLLABLE_FEATURES, result.x, strict=True):
        recommended_state[feature] = float(value)
    recommended_predictions = _predict(recommended_state)

    return {
        "well_id": well_id,
        "recommendedParameters": _to_api_recommendations(recommended_state),
        "predictions": {
            "current": _rounded_predictions(current_predictions),
            "recommended": _rounded_predictions(recommended_predictions),
            "current_score": round(_score(current_predictions), 6),
            "recommended_score": round(_score(recommended_predictions), 6),
            "objective_weights": {
                "oil_production": PRODUCTION_WEIGHT,
                "energy_per_barrel": ENERGY_PER_BARREL_WEIGHT,
                "steam_oil_ratio": STEAM_OIL_RATIO_WEIGHT,
                "avg_risk": AVG_RISK_WEIGHT,
            },
            "optimizer": {
                "method": "scipy.optimize.differential_evolution",
                "maxiter": OPTIMIZER_MAXITER,
                "popsize": OPTIMIZER_POPSIZE,
                "success": bool(result.success),
                "message": str(result.message),
            },
            "predicted_oil_flow_rate": round(float(recommended_predictions["oil_production"]), 6),
            "confidence": "xgboost-stage2-held-out-well-evaluation",
        },
    }
