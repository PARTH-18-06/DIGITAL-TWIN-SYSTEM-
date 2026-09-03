"""Train leakage-safe next-day oil-production forecasting models."""

from __future__ import annotations

import json
from pathlib import Path
import sys

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split
from xgboost import XGBRegressor

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "backend"))

from app.ml.forecasting.features import (  # noqa: E402
    FORECAST_FEATURE_COLUMNS,
    MODEL_VERSION,
    TARGET_COLUMN,
    prepare_forecast_training_frame,
)


DATASET_PATH = ROOT / "backend" / "data" / "baghewala_synthetic_dataset_v1.csv"
MODEL_DIR = ROOT / "backend" / "app" / "ml" / "forecasting"
REPORT_DIR = ROOT / "ai_ml" / "reports"
RANDOM_STATE = 42
HELD_OUT_WELL_COUNT = 5


def _model() -> XGBRegressor:
    return XGBRegressor(
        objective="reg:squarederror",
        n_estimators=450,
        max_depth=5,
        learning_rate=0.04,
        subsample=0.85,
        colsample_bytree=0.85,
        random_state=RANDOM_STATE,
        n_jobs=1,
    )


def _metrics(y_true, predictions, baseline) -> dict[str, float]:
    return {
        "mae": float(mean_absolute_error(y_true, predictions)),
        "rmse": float(np.sqrt(mean_squared_error(y_true, predictions))),
        "r2": float(r2_score(y_true, predictions)),
        "naive_previous_day_mae": float(mean_absolute_error(y_true, baseline)),
        "naive_previous_day_rmse": float(np.sqrt(mean_squared_error(y_true, baseline))),
        "naive_previous_day_r2": float(r2_score(y_true, baseline)),
    }


def train() -> dict:
    raw = pd.read_csv(DATASET_PATH)
    frame = prepare_forecast_training_frame(raw)

    split_date = frame["date"].quantile(0.80)
    chronological_train = frame[frame["date"] <= split_date]
    chronological_test = frame[frame["date"] > split_date]

    chronological_model = _model()
    chronological_model.fit(chronological_train[FORECAST_FEATURE_COLUMNS], chronological_train[TARGET_COLUMN])
    chronological_predictions = chronological_model.predict(chronological_test[FORECAST_FEATURE_COLUMNS])
    chronological_report = _metrics(
        chronological_test[TARGET_COLUMN],
        chronological_predictions,
        chronological_test.groupby("well_id")["oil_production"].shift(1).fillna(chronological_test["oil_production"]),
    )

    wells = sorted(frame["well_id"].unique())
    train_wells, held_out_wells = train_test_split(
        wells,
        test_size=HELD_OUT_WELL_COUNT,
        random_state=RANDOM_STATE,
        shuffle=True,
    )
    well_train = frame[frame["well_id"].isin(train_wells)]
    well_test = frame[frame["well_id"].isin(held_out_wells)]

    held_out_model = _model()
    held_out_model.fit(well_train[FORECAST_FEATURE_COLUMNS], well_train[TARGET_COLUMN])
    held_out_predictions = held_out_model.predict(well_test[FORECAST_FEATURE_COLUMNS])
    held_out_report = _metrics(
        well_test[TARGET_COLUMN],
        held_out_predictions,
        well_test.groupby("well_id")["oil_production"].shift(1).fillna(well_test["oil_production"]),
    )

    metadata = {
        "model_version": MODEL_VERSION,
        "dataset_type": "physics-informed synthetic dataset",
        "category_basis": "synthetic-dataset-relative",
        "field_validated": False,
        "feature_order": FORECAST_FEATURE_COLUMNS,
        "target": TARGET_COLUMN,
        "model_type": "xgboost.XGBRegressor",
        "training_split_for_saved_model": "held-out-well",
        "held_out_wells": sorted(held_out_wells),
        "train_wells": sorted(train_wells),
        "chronological_validation": {
            **chronological_report,
            "training_dates": {
                "start": str(chronological_train["date"].min().date()),
                "end": str(chronological_train["date"].max().date()),
            },
            "testing_dates": {
                "start": str(chronological_test["date"].min().date()),
                "end": str(chronological_test["date"].max().date()),
            },
            "training_wells": sorted(chronological_train["well_id"].unique()),
            "testing_wells": sorted(chronological_test["well_id"].unique()),
        },
        "held_out_well_validation": held_out_report,
        "leakage_audit": {
            "target_shift": "oil_production_next_day uses groupby(well_id).shift(-1) only as target",
            "future_rows_in_features": False,
            "rolling_windows_shifted": True,
            "lag_features_grouped_by_well": True,
            "excluded_from_features": [
                "oil_production",
                "steam_oil_ratio",
                "energy_consumption",
                "energy_per_barrel",
                "pump_efficiency",
                "rod_floating_risk",
                "impact_loading_risk",
                "pump_unsetting_risk",
                "rod_failure_risk",
            ],
        },
    }

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(held_out_model, MODEL_DIR / "next_day_oil_production.joblib")
    (MODEL_DIR / "metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    (REPORT_DIR / "next_day_forecast_report.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    return metadata


def main() -> int:
    metadata = train()
    chrono = metadata["chronological_validation"]
    held = metadata["held_out_well_validation"]
    print("Next-day forecast training complete")
    print(f"Chronological: R2={chrono['r2']:.4f}, MAE={chrono['mae']:.4f}, RMSE={chrono['rmse']:.4f}")
    print(f"Naive chronological: R2={chrono['naive_previous_day_r2']:.4f}, MAE={chrono['naive_previous_day_mae']:.4f}, RMSE={chrono['naive_previous_day_rmse']:.4f}")
    print(f"Held-out wells: {', '.join(metadata['held_out_wells'])}")
    print(f"Held-out-well: R2={held['r2']:.4f}, MAE={held['mae']:.4f}, RMSE={held['rmse']:.4f}")
    print(f"Naive held-out-well: R2={held['naive_previous_day_r2']:.4f}, MAE={held['naive_previous_day_mae']:.4f}, RMSE={held['naive_previous_day_rmse']:.4f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
