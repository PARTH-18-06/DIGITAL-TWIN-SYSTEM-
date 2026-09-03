"""Train Stage 2 XGBoost regressors on held-out Baghewala wells."""

from __future__ import annotations

import json
from pathlib import Path
import sys

import joblib
import pandas as pd
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import train_test_split
from xgboost import XGBRegressor

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from app.ml.features import FEATURE_COLUMNS, TARGET_COLUMNS  # noqa: E402


DATASET_PATH = Path(__file__).resolve().parents[2] / "data" / "baghewala_synthetic_dataset_v1.csv"
MODEL_DIR = Path(__file__).resolve().parent / "models"
RANDOM_STATE = 42
HELD_OUT_WELL_COUNT = 5


def train() -> dict[str, dict[str, float | str]]:
    df = pd.read_csv(DATASET_PATH)
    wells = sorted(df["well_id"].unique())
    train_wells, test_wells = train_test_split(
        wells,
        test_size=HELD_OUT_WELL_COUNT,
        random_state=RANDOM_STATE,
        shuffle=True,
    )
    train_df = df[df["well_id"].isin(train_wells)]
    test_df = df[df["well_id"].isin(test_wells)]
    x_train = train_df[FEATURE_COLUMNS]
    x_test = test_df[FEATURE_COLUMNS]

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    metadata = {
        "feature_order": FEATURE_COLUMNS,
        "targets": TARGET_COLUMNS,
        "held_out_wells": sorted(test_wells),
        "train_wells": sorted(train_wells),
        "split_strategy": "grouped by well_id; 20 train wells, 5 held-out test wells",
        "random_state": RANDOM_STATE,
    }
    (MODEL_DIR / "feature_order.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")

    report: dict[str, dict[str, float | str]] = {}
    for target in TARGET_COLUMNS:
        model = XGBRegressor(
            objective="reg:squarederror",
            n_estimators=350,
            max_depth=4,
            learning_rate=0.045,
            subsample=0.9,
            colsample_bytree=0.9,
            random_state=RANDOM_STATE,
            n_jobs=1,
        )
        model.fit(x_train, train_df[target])
        predictions = model.predict(x_test)
        r2 = float(r2_score(test_df[target], predictions))
        mae = float(mean_absolute_error(test_df[target], predictions))
        joblib.dump(model, MODEL_DIR / f"{target}.joblib")
        report[target] = {
            "r2": r2,
            "mae": mae,
            "generalization": "poor (R2 < 0.3)" if r2 < 0.3 else "acceptable",
        }
    return report


def main() -> int:
    report = train()
    print(f"Dataset: {DATASET_PATH}")
    print(f"Models written to: {MODEL_DIR}")
    print("Held-out evaluation by target:")
    for target, metrics in report.items():
        print(
            f"  {target}: R2={metrics['r2']:.4f}, "
            f"MAE={metrics['mae']:.4f}, {metrics['generalization']}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
