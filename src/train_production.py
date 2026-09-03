import os
import pandas as pd

from sklearn.linear_model import LinearRegression
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

from xgboost import XGBRegressor

import joblib


DATA_PATH = "data/baghewala_synthetic_dataset_v1.csv"
MODEL_DIR = "models"
OUTPUT_DIR = "outputs"


def prepare_data():
    # --------------------------------------------------
    # 1. Load dataset
    # --------------------------------------------------

    df = pd.read_csv(DATA_PATH)

    print("Dataset loaded successfully!")
    print("Rows:", len(df))
    print("Columns:", len(df.columns))

    # --------------------------------------------------
    # 2. Convert date and sort chronologically
    # --------------------------------------------------

    df["date"] = pd.to_datetime(df["date"])

    df = df.sort_values(
        ["well_id", "date"]
    ).reset_index(drop=True)

    # --------------------------------------------------
    # 3. Create next-day production target
    # --------------------------------------------------

    df["oil_production_next_day"] = (
        df.groupby("well_id")["oil_production"]
        .shift(-1)
    )

    # --------------------------------------------------
    # 4. Create historical features
    # --------------------------------------------------

    historical_columns = [
        "reservoir_temperature",
        "reservoir_pressure",
        "oil_viscosity",
        "water_cut",
    ]

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
                lambda x: x.shift(1).rolling(7).mean()
            )
        )

    # --------------------------------------------------
    # 5. Physics-inspired features
    # --------------------------------------------------

    df["temp_viscosity_ratio"] = (
        df["reservoir_temperature"]
        / (df["oil_viscosity"] + 1e-6)
    )

    df["pressure_temperature_index"] = (
        df["reservoir_pressure"]
        * df["reservoir_temperature"]
    )

    df["pump_speed_index"] = (
        df["stroke_length"]
        * df["spm"]
    )

    df["vfd_load_index"] = (
        df["vfd_frequency"]
        * df["spm"]
    )

    df["thermal_decay_proxy"] = (
        df["days_since_steam"]
        / (df["reservoir_temperature"] + 1e-6)
    )

    df["viscosity_pressure_index"] = (
        df["oil_viscosity"]
        / (df["reservoir_pressure"] + 1e-6)
    )

    df["thermal_mobility_proxy"] = (
        df["reservoir_temperature"]
        / (df["oil_viscosity"] + 1e-6)
    )

    # --------------------------------------------------
    # 6. Remove rows with insufficient history
    # --------------------------------------------------

    df = df.dropna().reset_index(drop=True)

    # --------------------------------------------------
    # 7. Define target
    # --------------------------------------------------

    target = "oil_production_next_day"

    # --------------------------------------------------
    # 8. Define model features
    # --------------------------------------------------

    features = [

        # CSS parameters
        "steam_volume",
        "injection_pressure",
        "soak_time",
        "production_cutoff",

        # Reservoir / fluid
        "reservoir_temperature",
        "reservoir_pressure",
        "oil_viscosity",
        "oil_api",
        "days_since_steam",
        "water_cut",
        "fluid_level",

        # SRP parameters
        "stroke_length",
        "spm",
        "vfd_frequency",

        # Historical temperature
        "reservoir_temperature_lag1",
        "reservoir_temperature_lag7",
        "reservoir_temperature_roll7_mean",

        # Historical pressure
        "reservoir_pressure_lag1",
        "reservoir_pressure_lag7",
        "reservoir_pressure_roll7_mean",

        # Historical viscosity
        "oil_viscosity_lag1",
        "oil_viscosity_lag7",
        "oil_viscosity_roll7_mean",

        # Historical water cut
        "water_cut_lag1",
        "water_cut_lag7",
        "water_cut_roll7_mean",

        # Physics-inspired
        "temp_viscosity_ratio",
        "pressure_temperature_index",
        "pump_speed_index",
        "vfd_load_index",
        "thermal_decay_proxy",
        "viscosity_pressure_index",
        "thermal_mobility_proxy",
    ]

    X = df[features]
    y = df[target]

    # --------------------------------------------------
    # 9. Time-based train/test split
    # --------------------------------------------------

    split_date = df["date"].quantile(0.80)

    train_mask = df["date"] <= split_date
    test_mask = df["date"] > split_date

    X_train = X.loc[train_mask]
    X_test = X.loc[test_mask]

    y_train = y.loc[train_mask]
    y_test = y.loc[test_mask]

    print("\n" + "=" * 60)
    print("DATA PREPARATION")
    print("=" * 60)

    print("\nTraining rows:", len(X_train))
    print("Testing rows:", len(X_test))
    print("Number of features:", len(features))

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

    return (
        df,
        X_train,
        X_test,
        y_train,
        y_test,
        features
    )


def train_models(X_train, X_test, y_train, y_test):
    # --------------------------------------------------
    # 10. Define models
    # --------------------------------------------------

    models = {

        "Linear Regression": LinearRegression(),

        "Random Forest": RandomForestRegressor(
            n_estimators=200,
            max_depth=20,
            min_samples_split=5,
            random_state=42,
            n_jobs=-1
        ),

        "XGBoost": XGBRegressor(
            n_estimators=300,
            max_depth=6,
            learning_rate=0.05,
            subsample=0.8,
            colsample_bytree=0.8,
            objective="reg:squarederror",
            random_state=42,
            n_jobs=-1
        )
    }

    results = []
    trained_models = {}

    # --------------------------------------------------
    # 11. Train each model
    # --------------------------------------------------

    print("\n" + "=" * 60)
    print("MODEL TRAINING")
    print("=" * 60)

    for name, model in models.items():

        print(f"\nTraining {name}...")

        model.fit(X_train, y_train)

        predictions = model.predict(X_test)

        mae = mean_absolute_error(
            y_test,
            predictions
        )

        rmse = mean_squared_error(
            y_test,
            predictions
        ) ** 0.5

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

        print(f"{name} completed.")
        print(f"MAE  : {mae:.4f}")
        print(f"RMSE : {rmse:.4f}")
        print(f"R2   : {r2:.4f}")

    # --------------------------------------------------
    # 12. Create comparison table
    # --------------------------------------------------

    results_df = pd.DataFrame(results)

    results_df = results_df.sort_values(
        "RMSE"
    ).reset_index(drop=True)

    print("\n" + "=" * 60)
    print("MODEL COMPARISON")
    print("=" * 60)

    print(results_df.to_string(index=False))

    return results_df, trained_models


def save_best_model(
    results_df,
    trained_models,
    X_test,
    y_test,
    features
):
    # --------------------------------------------------
    # 13. Select best model
    # --------------------------------------------------

    best_model_name = results_df.iloc[0]["Model"]

    best_model = trained_models[
        best_model_name
    ]

    print("\n" + "=" * 60)
    print("BEST MODEL")
    print("=" * 60)

    print("\nBest model:", best_model_name)

    print(
        "RMSE:",
        round(results_df.iloc[0]["RMSE"], 4)
    )

    print(
        "MAE:",
        round(results_df.iloc[0]["MAE"], 4)
    )

    print(
        "R2:",
        round(results_df.iloc[0]["R2"], 4)
    )

    # --------------------------------------------------
    # 14. Create directories
    # --------------------------------------------------

    os.makedirs(
        MODEL_DIR,
        exist_ok=True
    )

    os.makedirs(
        OUTPUT_DIR,
        exist_ok=True
    )

    # --------------------------------------------------
    # 15. Save model
    # --------------------------------------------------

    model_path = os.path.join(
        MODEL_DIR,
        "best_production_model.pkl"
    )

    joblib.dump(
        best_model,
        model_path
    )

    print("\nBest model saved to:")
    print(model_path)

    # --------------------------------------------------
    # 16. Save model comparison
    # --------------------------------------------------

    comparison_path = os.path.join(
        OUTPUT_DIR,
        "model_comparison_production.csv"
    )

    results_df.to_csv(
        comparison_path,
        index=False
    )

    print("\nModel comparison saved to:")
    print(comparison_path)

    # --------------------------------------------------
    # 17. Save feature importance
    # --------------------------------------------------

    if hasattr(best_model, "feature_importances_"):

        importance_df = pd.DataFrame({
            "feature": features,
            "importance": best_model.feature_importances_
        })

        importance_df = importance_df.sort_values(
            "importance",
            ascending=False
        )

        importance_path = os.path.join(
            OUTPUT_DIR,
            "production_feature_importance.csv"
        )

        importance_df.to_csv(
            importance_path,
            index=False
        )

        print("\nFeature importance saved to:")
        print(importance_path)

        print("\nTop 10 important features:")

        print(
            importance_df.head(10).to_string(
                index=False
            )
        )


def main():

    # Prepare dataset
    (
        df,
        X_train,
        X_test,
        y_train,
        y_test,
        features
    ) = prepare_data()

    # Train models
    results_df, trained_models = train_models(
        X_train,
        X_test,
        y_train,
        y_test
    )

    # Save best model
    save_best_model(
        results_df,
        trained_models,
        X_test,
        y_test,
        features
    )

    print("\n" + "=" * 60)
    print("TRAINING COMPLETED SUCCESSFULLY")
    print("=" * 60)


if __name__ == "__main__":
    main()