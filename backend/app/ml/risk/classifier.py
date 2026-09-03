"""Runtime risk classifier loading and inference."""

from __future__ import annotations

from functools import lru_cache
import json
from pathlib import Path
from typing import Any

import joblib
import pandas as pd

from app.ml.risk.categories import CATEGORY_BASIS, FIELD_VALIDATED, category_from_probability, category_from_score


MODEL_DIR = Path(__file__).resolve().parent
METADATA_PATH = MODEL_DIR / "metadata.json"
MODEL_VERSION = "srp-risk-classifier-v1"

RISK_FEATURE_COLUMNS = [
    "steam_volume",
    "injection_pressure",
    "soak_time",
    "production_cutoff",
    "reservoir_temperature",
    "reservoir_pressure",
    "oil_viscosity",
    "oil_api",
    "days_since_steam",
    "water_cut",
    "fluid_level",
    "stroke_length",
    "spm",
    "vfd_frequency",
]

CLASSIFIER_TARGETS = {
    "rod_floating": "rod_floating_risk",
    "impact_loading": "impact_loading_risk",
    "pump_unsetting": "pump_unsetting_risk",
}

FORBIDDEN_FEATURE_COLUMNS = {
    "oil_production",
    "steam_oil_ratio",
    "energy_consumption",
    "energy_per_barrel",
    "pump_efficiency",
    "rod_floating_risk",
    "impact_loading_risk",
    "pump_unsetting_risk",
    "rod_failure_risk",
}


class RiskArtifactsMissing(RuntimeError):
    """Raised when risk metadata or models are not available."""


@lru_cache(maxsize=1)
def _load_artifacts() -> tuple[dict[str, Any], dict[str, Any]]:
    if not METADATA_PATH.exists():
        raise RiskArtifactsMissing("Missing risk metadata. Run python ai_ml/training/risk_classification/train_classifiers.py first.")
    metadata = json.loads(METADATA_PATH.read_text(encoding="utf-8"))
    if metadata.get("feature_order") != RISK_FEATURE_COLUMNS:
        raise RiskArtifactsMissing("Risk metadata feature order does not match runtime features.")

    models = {}
    for risk_name in CLASSIFIER_TARGETS:
        model_path = MODEL_DIR / f"{risk_name}.joblib"
        if not model_path.exists():
            raise RiskArtifactsMissing(f"Missing risk classifier model: {model_path}")
        models[risk_name] = joblib.load(model_path)
    return metadata, models


def risk_feature_state(current_state: dict[str, Any]) -> dict[str, float]:
    mapping = {
        "steam_volume": "steam_volume",
        "injection_pressure": "steam_injection_pressure",
        "soak_time": "soak_time",
        "production_cutoff": "production_cutoff",
        "reservoir_temperature": "temperature",
        "reservoir_pressure": "pressure",
        "oil_viscosity": "viscosity",
        "oil_api": "oil_api",
        "days_since_steam": "days_since_steam",
        "water_cut": "water_cut",
        "fluid_level": "fluid_level",
        "stroke_length": "stroke_length",
        "spm": "rpm_or_spm",
        "vfd_frequency": "vfd_frequency",
    }
    missing = []
    state = {}
    for feature, api_field in mapping.items():
        value = current_state.get(api_field)
        if value is None:
            missing.append(feature)
            continue
        state[feature] = float(value)
    if missing:
        raise ValueError("Missing required risk feature(s): " + ", ".join(missing))
    return state


def classify_risks(current_state: dict[str, Any], continuous_scores: dict[str, float]) -> dict[str, Any]:
    metadata, models = _load_artifacts()
    state = risk_feature_state(current_state)
    row = pd.DataFrame([[state[column] for column in RISK_FEATURE_COLUMNS]], columns=RISK_FEATURE_COLUMNS)

    risks = {}
    for risk_name, target_column in CLASSIFIER_TARGETS.items():
        model = models[risk_name]
        probability = _positive_probability(model, row)
        risks[risk_name] = {
            "risk_score": round(float(continuous_scores[target_column]), 6),
            "category": category_from_probability(probability),
            "classifier_probability": round(float(probability), 6),
        }

    rod_failure_thresholds = metadata["continuous_score_thresholds"]["rod_failure_risk"]
    rod_failure_score = float(continuous_scores["rod_failure_risk"])
    risks["rod_failure"] = {
        "risk_score": round(rod_failure_score, 6),
        "category": category_from_score(
            rod_failure_score,
            medium_threshold=float(rod_failure_thresholds["medium"]),
            high_threshold=float(rod_failure_thresholds["high"]),
        ),
        "classifier_probability": None,
    }
    return {
        "risks": risks,
        "category_basis": CATEGORY_BASIS,
        "field_validated": FIELD_VALIDATED,
        "model_version": metadata.get("model_version", MODEL_VERSION),
        "validation_summary": {
            "chronological": metadata.get("chronological_validation", {}),
            "held_out_well": metadata.get("held_out_well_validation", {}),
        },
    }


def _positive_probability(model: Any, row: pd.DataFrame) -> float:
    if not hasattr(model, "predict_proba") or 1 not in model.classes_:
        return 0.0
    positive_index = list(model.classes_).index(1)
    return float(model.predict_proba(row)[0, positive_index])
