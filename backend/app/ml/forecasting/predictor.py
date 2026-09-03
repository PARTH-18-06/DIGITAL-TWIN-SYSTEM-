"""Runtime next-day forecast inference."""

from __future__ import annotations

from functools import lru_cache
import json
from pathlib import Path
from typing import Any

import joblib
import pandas as pd

from app.ml.forecasting.features import (
    FORECAST_FEATURE_COLUMNS,
    HISTORY_WINDOW_DAYS,
    MODEL_VERSION,
    InsufficientHistory,
    latest_feature_row,
)


MODEL_DIR = Path(__file__).resolve().parent
MODEL_PATH = MODEL_DIR / "next_day_oil_production.joblib"
METADATA_PATH = MODEL_DIR / "metadata.json"
DATASET_PATH = Path(__file__).resolve().parents[3] / "data" / "baghewala_synthetic_dataset_v1.csv"


class ForecastArtifactsMissing(RuntimeError):
    """Raised when the next-day forecast model or metadata is unavailable."""


@lru_cache(maxsize=1)
def _load_artifacts() -> tuple[Any, dict[str, Any]]:
    if not METADATA_PATH.exists():
        raise ForecastArtifactsMissing("Missing forecast metadata. Run python ai_ml/training/forecasting/train_next_day.py first.")
    if not MODEL_PATH.exists():
        raise ForecastArtifactsMissing("Missing forecast model. Run python ai_ml/training/forecasting/train_next_day.py first.")
    metadata = json.loads(METADATA_PATH.read_text(encoding="utf-8"))
    if metadata.get("feature_order") != FORECAST_FEATURE_COLUMNS:
        raise ForecastArtifactsMissing("Forecast metadata feature order does not match runtime features.")
    return joblib.load(MODEL_PATH), metadata


def load_local_csv_observations(well_name: str) -> list[dict[str, Any]]:
    df = pd.read_csv(DATASET_PATH, parse_dates=["date"])
    well_df = df[df["well_id"] == well_name].sort_values("date")
    return _records(well_df)


def predict_next_day(well_name: str, observations: list[dict[str, Any]], history_source: str) -> dict[str, Any]:
    model, metadata = _load_artifacts()
    features, latest = latest_feature_row(observations)
    prediction = float(model.predict(features)[0])
    latest_date = pd.to_datetime(latest["date"]).date()
    forecast_date = latest_date + pd.Timedelta(days=1)
    return {
        "well_id": well_name,
        "forecast_date": forecast_date.isoformat(),
        "predicted_oil_production": round(prediction, 6),
        "history_window_days": HISTORY_WINDOW_DAYS,
        "model_version": metadata.get("model_version", MODEL_VERSION),
        "validation_summary": {
            "chronological_r2": round(float(metadata["chronological_validation"]["r2"]), 6),
            "held_out_well_r2": round(float(metadata["held_out_well_validation"]["r2"]), 6),
        },
        "dataset_type": metadata.get("dataset_type", "physics-informed synthetic dataset"),
        "category_basis": metadata.get("category_basis", "synthetic-dataset-relative"),
        "field_validated": bool(metadata.get("field_validated", False)),
        "history_source": history_source,
        "persistence_status": "not_attempted",
        "input_snapshot": {
            "latest_observed_at": latest_date.isoformat(),
            "features": {column: round(float(features.iloc[0][column]), 6) for column in FORECAST_FEATURE_COLUMNS},
        },
    }


def _records(df: pd.DataFrame) -> list[dict[str, Any]]:
    records = df.to_dict(orient="records")
    for row in records:
        row["date"] = pd.to_datetime(row["date"]).date().isoformat()
    return records
