import os
import pandas as pd
import numpy as np
import joblib

from xgboost import XGBRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

import matplotlib.pyplot as plt


# ============================================================
# PATHS
# ============================================================

DATA_PATH = "data/baghewala_synthetic_dataset_v1.csv"

MODEL_DIR = "models"
OUTPUT_DIR = "outputs"

MODEL_PATH = os.path.join(
    MODEL_DIR,
    "xgboost_production_model.pkl"
)


# ============================================================
# FEATURES
# ============================================================

FEATURES = [
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

    "reservoir_temperature_lag1",
    "reservoir_temperature_lag7",
    "reservoir_temperature_roll7_mean",

    "reservoir_pressure_lag1",
    "reservoir_pressure_lag7",
    "reservoir_pressure_roll7_mean",

    "oil_viscosity_lag1",
    "oil_viscosity_lag7",
    "oil_viscosity_roll7_mean",

    "water_cut_lag1",
    "water_cut_lag7",
    "water_cut_roll7_mean",

    "temp_viscosity_ratio",
    "pressure_temperature_index",
    "pump_speed_index",
    "vfd_load_index",
    "thermal_decay_proxy",
    "viscosity_pressure_index",
    "thermal_mobility_proxy"
]

TARGET = "oil_production_next_day"


# ============================================================
# DATA PREPARATION
# ============================================================

def prepare_data():

    print("=" * 70)
    print("STAGE 2 - XGBOOST PRODUCTION MODEL")
    print("=" * 70)

    print("\nLoading dataset...")

    df = pd.read_csv(DATA_PATH)

    print("Dataset loaded successfully!")
    print("Rows:", len(df))
    print("Columns:", len(df.columns))

    # --------------------------------------------------------
    # Date handling
    # --------------------------------------------------------

    df["date"] = pd.to_datetime(df["date"])

    df = df.sort_values(
        ["well_id", "date"]
    ).reset_index(drop=True)

    # --------------------------------------------------------
    # Target: next-day oil production
    # --------------------------------------------------------

    df[TARGET] = (
        df.groupby("well_id")["oil_production"]
        .shift(-1)
    )

    # --------------------------------------------------------
    # Historical features
    # --------------------------------------------------------

    historical_columns = [
        "reservoir_temperature",
        "reservoir_pressure",
        "oil_viscosity",
        "water_cut"
    ]

    print("\nCreating historical features...")

    for column in historical_columns:

        df[f"{column}_lag1"] = (
            df.groupby("well_id")[column]
            .shift(1)
        )

        df[f"{column}_lag7"] = (
            df.groupby("well_id")[column]
            .shift(7)
        )

        df[f"{column}_roll7_mean"] = (
            df.groupby("well_id")[column]
            .transform(
                lambda x:
                x.shift(1)
                .rolling(7)
                .mean()
            )
        )

    # --------------------------------------------------------
    # Physics-inspired features
    # --------------------------------------------------------

    print("Creating physics-inspired features...")

    df["temp_viscosity_ratio"] = (
        df["reservoir_temperature"]
        /
        (df["oil_viscosity"] + 1e-6)
    )

    df["pressure_temperature_index"] = (
        df["reservoir_pressure"]
        *
        df["reservoir_temperature"]
    )

    df["pump_speed_index"] = (
        df["stroke_length"]
        *
        df["spm"]
    )

    df["vfd_load_index"] = (
        df["vfd_frequency"]
        *
        df["spm"]
    )

    df["thermal_decay_proxy"] = (
        df["days_since_steam"]
        /
        (df["reservoir_temperature"] + 1e-6)
    )

    df["viscosity_pressure_index"] = (
        df["oil_viscosity"]
        /
        (df["reservoir_pressure"] + 1e-6)
    )

    df["thermal_mobility_proxy"] = (
        df["reservoir_temperature"]
        /
        (df["oil_viscosity"] + 1e-6)
    )

    # --------------------------------------------------------
    # Remove incomplete rows
    # --------------------------------------------------------

    df = df.dropna().reset_index(drop=True)

    print("\nRows after feature engineering:", len(df))

    # --------------------------------------------------------
    # Feature matrix and target
    # --------------------------------------------------------

    X = df[FEATURES]
    y = df[TARGET]

    # --------------------------------------------------------
    # Time-aware split
    # --------------------------------------------------------

    split_date = df["date"].quantile(0.80)

    train_mask = df["date"] <= split_date
    test_mask = df["date"] > split_date

    X_train = X.loc[train_mask]
    X_test = X.loc[test_mask]

    y_train = y.loc[train_mask]
    y_test = y.loc[test_mask]

    print("\n" + "=" * 70)
    print("DATA SPLIT")
    print("=" * 70)

    print("\nTraining rows:", len(X_train))
    print("Testing rows :", len(X_test))

    print("\nTraining period:")
    print(
        df.loc[train_mask, "date"].min(),
        "to",
        df.loc[train_mask, "date"].max()
    )

    print("\nTesting period:")
    print(
        df.loc[test_mask, "date"].min(),
        "to",
        df.loc[test_mask, "date"].max()
    )

    print("\nNumber of features:", len(FEATURES))

    return (
        df,
        X_train,
        X_test,
        y_train,
        y_test
    )


# ============================================================
# TRAIN XGBOOST MODELS
# ============================================================

def train_xgboost_models(
    X_train,
    X_test,
    y_train,
    y_test
):

    print("\n" + "=" * 70)
    print("XGBOOST TRAINING")
    print("=" * 70)

    models = {

        "XGBoost Baseline": XGBRegressor(
            n_estimators=300,
            max_depth=6,
            learning_rate=0.05,
            subsample=0.8,
            colsample_bytree=0.8,
            objective="reg:squarederror",
            random_state=42,
            n_jobs=-1
        ),

        "XGBoost Tuned": XGBRegressor(
            n_estimators=600,
            max_depth=5,
            learning_rate=0.03,
            min_child_weight=3,
            subsample=0.85,
            colsample_bytree=0.85,
            reg_alpha=0.05,
            reg_lambda=1.0,
            objective="reg:squarederror",
            random_state=42,
            n_jobs=-1
        )
    }

    results = []
    trained_models = {}

    for name, model in models.items():

        print("\n" + "-" * 70)
        print("Training:", name)
        print("-" * 70)

        model.fit(
            X_train,
            y_train
        )

        predictions = model.predict(
            X_test
        )

        mae = mean_absolute_error(
            y_test,
            predictions
        )

        rmse = np.sqrt(
            mean_squared_error(
                y_test,
                predictions
            )
        )

        r2 = r2_score(
            y_test,
            predictions
        )

        results.append({
            "Model": name,
            "MAE": mae,
            "RMSE": rmse,
            "R2": r2
        })

        trained_models[name] = model

        print("\nResults:")
        print("MAE :", round(mae, 4))
        print("RMSE:", round(rmse, 4))
        print("R2  :", round(r2, 4))

    results_df = (
        pd.DataFrame(results)
        .sort_values("RMSE")
        .reset_index(drop=True)
    )

    print("\n" + "=" * 70)
    print("XGBOOST MODEL COMPARISON")
    print("=" * 70)

    print(
        results_df.to_string(
            index=False
        )
    )

    return (
        results_df,
        trained_models
    )


# ============================================================
# SAVE BEST MODEL
# ============================================================

def save_best_model(
    results_df,
    trained_models,
    X_test,
    y_test
):

    best_model_name = (
        results_df.iloc[0]["Model"]
    )

    best_model = (
        trained_models[best_model_name]
    )

    print("\n" + "=" * 70)
    print("BEST XGBOOST MODEL")
    print("=" * 70)

    best_rmse = results_df.iloc[0]["RMSE"]
    best_mae = results_df.iloc[0]["MAE"]
    best_r2 = results_df.iloc[0]["R2"]

    print("\nBest model:", best_model_name)
    print("RMSE:", round(best_rmse, 4))
    print("MAE :", round(best_mae, 4))
    print("R2  :", round(best_r2, 4))

    os.makedirs(
        MODEL_DIR,
        exist_ok=True
    )

    os.makedirs(
        OUTPUT_DIR,
        exist_ok=True
    )

    # --------------------------------------------------------
    # Save model
    # --------------------------------------------------------

    joblib.dump(
        best_model,
        MODEL_PATH
    )

    print("\nModel saved to:")
    print(MODEL_PATH)

    # --------------------------------------------------------
    # Save comparison
    # --------------------------------------------------------

    comparison_path = os.path.join(
        OUTPUT_DIR,
        "xgboost_model_comparison.csv"
    )

    results_df.to_csv(
        comparison_path,
        index=False
    )

    print("\nModel comparison saved to:")
    print(comparison_path)

    # --------------------------------------------------------
    # Feature importance
    # --------------------------------------------------------

    importance_df = pd.DataFrame({

        "feature": FEATURES,

        "importance":
            best_model.feature_importances_

    })

    importance_df = (
        importance_df
        .sort_values(
            "importance",
            ascending=False
        )
        .reset_index(drop=True)
    )

    importance_path = os.path.join(
        OUTPUT_DIR,
        "xgboost_feature_importance.csv"
    )

    importance_df.to_csv(
        importance_path,
        index=False
    )

    print("\nFeature importance saved to:")
    print(importance_path)

    print("\nTop 15 important features:")

    print(
        importance_df
        .head(15)
        .to_string(index=False)
    )

    return best_model


# ============================================================
# ACTUAL VS PREDICTED GRAPH
# ============================================================

def create_prediction_plot(
    model,
    X_test,
    y_test
):

    predictions = model.predict(
        X_test
    )

    plot_path = os.path.join(
        OUTPUT_DIR,
        "xgboost_actual_vs_predicted.png"
    )

    plt.figure(
        figsize=(10, 6)
    )

    plt.scatter(
        y_test,
        predictions,
        alpha=0.5
    )

    min_value = min(
        y_test.min(),
        predictions.min()
    )

    max_value = max(
        y_test.max(),
        predictions.max()
    )

    plt.plot(
        [min_value, max_value],
        [min_value, max_value],
        linestyle="--"
    )

    plt.xlabel(
        "Actual Next-Day Oil Production"
    )

    plt.ylabel(
        "Predicted Next-Day Oil Production"
    )

    plt.title(
        "XGBoost - Actual vs Predicted Production"
    )

    plt.tight_layout()

    plt.savefig(
        plot_path,
        dpi=200
    )

    plt.close()

    print("\nActual vs predicted graph saved to:")
    print(plot_path)


# ============================================================
# MAIN
# ============================================================

def main():

    (
        df,
        X_train,
        X_test,
        y_train,
        y_test
    ) = prepare_data()

    (
        results_df,
        trained_models
    ) = train_xgboost_models(
        X_train,
        X_test,
        y_train,
        y_test
    )

    best_model = save_best_model(
        results_df,
        trained_models,
        X_test,
        y_test
    )

    create_prediction_plot(
        best_model,
        X_test,
        y_test
    )

    print("\n" + "=" * 70)
    print("STAGE 2 XGBOOST TRAINING COMPLETED")
    print("=" * 70)

    print("\nGenerated files:")

    print(
        "1.",
        MODEL_PATH
    )

    print(
        "2.",
        os.path.join(
            OUTPUT_DIR,
            "xgboost_model_comparison.csv"
        )
    )

    print(
        "3.",
        os.path.join(
            OUTPUT_DIR,
            "xgboost_feature_importance.csv"
        )
    )

    print(
        "4.",
        os.path.join(
            OUTPUT_DIR,
            "xgboost_actual_vs_predicted.png"
        )
    )

    print("\nIMPORTANT:")
    print(
        "This model is trained on "
        "physics-informed synthetic demo data."
    )

    print(
        "It is NOT validated on actual "
        "Baghewala field data."
    )


if __name__ == "__main__":
    main()