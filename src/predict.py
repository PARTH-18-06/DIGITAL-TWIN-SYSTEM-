import os
import joblib
import pandas as pd


# ============================================================
# CONFIGURATION
# ============================================================

MODEL_PATH = "models/best_production_model.pkl"
DATA_PATH = "data/baghewala_synthetic_dataset_v1.csv"


# ============================================================
# FEATURE LIST
# Must match the features used during model training
# ============================================================

FEATURES = [

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

    # Physics-inspired features
    "temp_viscosity_ratio",
    "pressure_temperature_index",
    "pump_speed_index",
    "vfd_load_index",
    "thermal_decay_proxy",
    "viscosity_pressure_index",
    "thermal_mobility_proxy",
]


# ============================================================
# LOAD MODEL
# ============================================================

def load_model():

    if not os.path.exists(MODEL_PATH):

        print("ERROR: Model file not found.")

        print("\nExpected model location:")
        print(MODEL_PATH)

        print("\nPlease run:")
        print("python src\\train_production.py")

        return None

    model = joblib.load(MODEL_PATH)

    print("Production model loaded successfully!")

    return model


# ============================================================
# LOAD DATA
# ============================================================

def load_data():

    if not os.path.exists(DATA_PATH):

        print("ERROR: Dataset not found.")

        print("\nExpected dataset location:")
        print(DATA_PATH)

        return None

    df = pd.read_csv(DATA_PATH)

    df["date"] = pd.to_datetime(df["date"])

    df = df.sort_values(
        ["well_id", "date"]
    ).reset_index(drop=True)

    return df


# ============================================================
# CREATE FEATURES
# Same feature engineering used during training
# ============================================================

def create_features(df):

    # --------------------------------------------------------
    # Historical features
    # --------------------------------------------------------

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
                lambda x:
                x.shift(1)
                .rolling(7)
                .mean()
            )
        )

    # --------------------------------------------------------
    # Physics-inspired features
    # --------------------------------------------------------

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

    return df


# ============================================================
# PREDICT FOR A WELL
# ============================================================

def predict_well(model, df, well_id):

    # --------------------------------------------------------
    # Select well
    # --------------------------------------------------------

    well_data = df[
        df["well_id"] == well_id
    ].copy()

    if len(well_data) == 0:

        print(
            f"\nERROR: Well '{well_id}' "
            "was not found in the dataset."
        )

        return

    # --------------------------------------------------------
    # Sort chronologically
    # --------------------------------------------------------

    well_data = well_data.sort_values(
        "date"
    ).reset_index(drop=True)

    # --------------------------------------------------------
    # Create features
    # --------------------------------------------------------

    well_data = create_features(
        well_data
    )

    # --------------------------------------------------------
    # Remove rows where historical
    # features are unavailable
    # --------------------------------------------------------

    well_data = well_data.dropna(
        subset=FEATURES
    ).reset_index(drop=True)

    if len(well_data) == 0:

        print(
            "\nERROR: Not enough historical "
            "data to create prediction features."
        )

        return

    # --------------------------------------------------------
    # Use latest available row
    # --------------------------------------------------------

    latest = well_data.iloc[-1]

    X = pd.DataFrame(
        [latest[FEATURES]],
        columns=FEATURES
    )

    # --------------------------------------------------------
    # Make prediction
    # --------------------------------------------------------

    prediction = model.predict(X)[0]

    # --------------------------------------------------------
    # Display result
    # --------------------------------------------------------

    print("\n" + "=" * 60)
    print("OIL PRODUCTION PREDICTION")
    print("=" * 60)

    print("\nWell ID:")
    print(well_id)

    print("\nLatest data date:")
    print(
        latest["date"].strftime("%Y-%m-%d")
    )

    print("\nCurrent operating conditions:")
    print(
        f"Reservoir Temperature : "
        f"{latest['reservoir_temperature']:.2f}"
    )

    print(
        f"Reservoir Pressure    : "
        f"{latest['reservoir_pressure']:.2f}"
    )

    print(
        f"Oil Viscosity         : "
        f"{latest['oil_viscosity']:.2f}"
    )

    print(
        f"Water Cut             : "
        f"{latest['water_cut']:.2f}"
    )

    print(
        f"Steam Volume          : "
        f"{latest['steam_volume']:.2f}"
    )

    print(
        f"Injection Pressure    : "
        f"{latest['injection_pressure']:.2f}"
    )

    print(
        f"Soak Time             : "
        f"{latest['soak_time']:.2f}"
    )

    print(
        f"Stroke Length         : "
        f"{latest['stroke_length']:.2f}"
    )

    print(
        f"SPM                   : "
        f"{latest['spm']:.2f}"
    )

    print(
        f"VFD Frequency         : "
        f"{latest['vfd_frequency']:.2f}"
    )

    print("\n" + "-" * 60)

    print(
        "\nPredicted next-day oil production:"
    )

    print(
        f"{prediction:.2f} units/day"
    )

    print("\n" + "=" * 60)


# ============================================================
# MAIN
# ============================================================

def main():

    print("\n" + "=" * 60)
    print("BAGHEWALA DIGITAL TWIN")
    print("AI PRODUCTION PREDICTION")
    print("=" * 60)

    # --------------------------------------------------------
    # Load model
    # --------------------------------------------------------

    model = load_model()

    if model is None:
        return

    # --------------------------------------------------------
    # Load dataset
    # --------------------------------------------------------

    df = load_data()

    if df is None:
        return

    # --------------------------------------------------------
    # Ask user for well ID
    # --------------------------------------------------------

    print("\nAvailable wells:")

    wells = sorted(
        df["well_id"].unique()
    )

    print(
        ", ".join(wells)
    )

    print()

    well_id = input(
        "Enter Well ID (example: BGH-001): "
    ).strip()

    # --------------------------------------------------------
    # Predict
    # --------------------------------------------------------

    predict_well(
        model,
        df,
        well_id
    )


# ============================================================
# RUN PROGRAM
# ============================================================

if __name__ == "__main__":
    main()