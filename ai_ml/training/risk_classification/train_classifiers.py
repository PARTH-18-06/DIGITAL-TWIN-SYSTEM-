"""Train leakage-audited SRP risk classifiers."""

from __future__ import annotations

import json
from pathlib import Path
import sys

import joblib
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "backend"))

from app.ml.risk.classifier import (  # noqa: E402
    CLASSIFIER_TARGETS,
    FORBIDDEN_FEATURE_COLUMNS,
    MODEL_VERSION,
    RISK_FEATURE_COLUMNS,
)


DATASET_PATH = ROOT / "backend" / "data" / "baghewala_synthetic_dataset_v1.csv"
MODEL_DIR = ROOT / "backend" / "app" / "ml" / "risk"
REPORT_DIR = ROOT / "ai_ml" / "reports"
RANDOM_STATE = 42
HELD_OUT_WELL_COUNT = 5
HIGH_RISK_QUANTILE = 0.75


def _model() -> RandomForestClassifier:
    return RandomForestClassifier(
        n_estimators=260,
        max_depth=14,
        min_samples_split=5,
        class_weight="balanced",
        random_state=RANDOM_STATE,
        n_jobs=-1,
    )


def _binary_target(values: pd.Series, threshold: float) -> pd.Series:
    return (values >= threshold).astype(int)


def _evaluate(model, x_test: pd.DataFrame, y_test: pd.Series) -> dict:
    predictions = model.predict(x_test)
    probabilities = model.predict_proba(x_test)[:, list(model.classes_).index(1)] if 1 in model.classes_ else None
    return {
        "accuracy": float(accuracy_score(y_test, predictions)),
        "precision": float(precision_score(y_test, predictions, zero_division=0)),
        "recall": float(recall_score(y_test, predictions, zero_division=0)),
        "f1": float(f1_score(y_test, predictions, zero_division=0)),
        "roc_auc": float(roc_auc_score(y_test, probabilities)) if probabilities is not None and y_test.nunique() > 1 else None,
        "class_distribution": {str(key): int(value) for key, value in y_test.value_counts().sort_index().items()},
        "confusion_matrix": confusion_matrix(y_test, predictions).tolist(),
    }


def _train_for_split(train_df: pd.DataFrame, test_df: pd.DataFrame, target_column: str) -> tuple[RandomForestClassifier, float, dict]:
    threshold = float(train_df[target_column].quantile(HIGH_RISK_QUANTILE))
    y_train = _binary_target(train_df[target_column], threshold)
    y_test = _binary_target(test_df[target_column], threshold)
    model = _model()
    model.fit(train_df[RISK_FEATURE_COLUMNS], y_train)
    return model, threshold, _evaluate(model, test_df[RISK_FEATURE_COLUMNS], y_test)


def train() -> dict:
    if FORBIDDEN_FEATURE_COLUMNS.intersection(RISK_FEATURE_COLUMNS):
        raise RuntimeError("Risk target/leakage columns are present in classifier features.")

    df = pd.read_csv(DATASET_PATH)
    df["date"] = pd.to_datetime(df["date"])
    df = df.sort_values(["well_id", "date"]).reset_index(drop=True)

    split_date = df["date"].quantile(0.80)
    chronological_train = df[df["date"] <= split_date]
    chronological_test = df[df["date"] > split_date]

    wells = sorted(df["well_id"].unique())
    train_wells, held_out_wells = train_test_split(
        wells,
        test_size=HELD_OUT_WELL_COUNT,
        random_state=RANDOM_STATE,
        shuffle=True,
    )
    well_train = df[df["well_id"].isin(train_wells)]
    well_test = df[df["well_id"].isin(held_out_wells)]

    metadata = {
        "model_version": MODEL_VERSION,
        "dataset_type": "physics-informed synthetic dataset",
        "category_basis": "synthetic-dataset-relative",
        "field_validated": False,
        "feature_order": RISK_FEATURE_COLUMNS,
        "targets": CLASSIFIER_TARGETS,
        "high_risk_quantile": HIGH_RISK_QUANTILE,
        "held_out_wells": sorted(held_out_wells),
        "train_wells": sorted(train_wells),
        "chronological_validation": {},
        "held_out_well_validation": {},
        "thresholds": {},
        "continuous_score_thresholds": {
            column: {
                "medium": float(well_train[column].quantile(0.50)),
                "high": float(well_train[column].quantile(0.75)),
            }
            for column in [*CLASSIFIER_TARGETS.values(), "rod_failure_risk"]
        },
        "leakage_audit": {
            "risk_target_columns_in_features": False,
            "thresholds_from_training_data_only": True,
            "forbidden_columns": sorted(FORBIDDEN_FEATURE_COLUMNS),
        },
    }

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_DIR.mkdir(parents=True, exist_ok=True)

    for risk_name, target_column in CLASSIFIER_TARGETS.items():
        _, chronological_threshold, chronological_metrics = _train_for_split(
            chronological_train,
            chronological_test,
            target_column,
        )
        saved_model, held_out_threshold, held_out_metrics = _train_for_split(
            well_train,
            well_test,
            target_column,
        )
        joblib.dump(saved_model, MODEL_DIR / f"{risk_name}.joblib")
        metadata["thresholds"][risk_name] = {
            "target": target_column,
            "chronological_training_only_threshold": chronological_threshold,
            "held_out_training_only_threshold": held_out_threshold,
        }
        metadata["chronological_validation"][risk_name] = chronological_metrics
        metadata["held_out_well_validation"][risk_name] = held_out_metrics

    (MODEL_DIR / "metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    (REPORT_DIR / "risk_classifier_report.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    return metadata


def _metric_line(metrics: dict) -> str:
    roc = metrics["roc_auc"]
    roc_text = "n/a" if roc is None else f"{roc:.4f}"
    return (
        f"accuracy={metrics['accuracy']:.4f}, precision={metrics['precision']:.4f}, "
        f"recall={metrics['recall']:.4f}, f1={metrics['f1']:.4f}, roc_auc={roc_text}"
    )


def main() -> int:
    metadata = train()
    print("Risk classifier training complete")
    for risk_name in CLASSIFIER_TARGETS:
        print(f"{risk_name} chronological: {_metric_line(metadata['chronological_validation'][risk_name])}")
        print(f"{risk_name} held-out-well: {_metric_line(metadata['held_out_well_validation'][risk_name])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
