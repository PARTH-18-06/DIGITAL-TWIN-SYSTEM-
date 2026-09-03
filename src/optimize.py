import os
import numpy as np
import pandas as pd
import joblib


# ============================================================
# PATHS
# ============================================================

DATA_PATH = "data/baghewala_synthetic_dataset_v1.csv"
MODEL_DIR = "models"
OUTPUT_DIR = "outputs"

PRODUCTION_MODEL_PATH = os.path.join(
    MODEL_DIR,
    "best_production_model.pkl"
)

RISK_MODEL_PATHS = {
    "rod_floating": os.path.join(
        MODEL_DIR,
        "rod_floating_risk_model.pkl"
    ),
    "impact_loading": os.path.join(
        MODEL_DIR,
        "impact_loading_risk_model.pkl"
    ),
    "pump_unsetting": os.path.join(
        MODEL_DIR,
        "pump_unsetting_risk_model.pkl"
    ),
}

RANDOM_SEED = 42
NUMBER_OF_CANDIDATES = 1000


# ============================================================
# LOAD DATA
# ============================================================

def load_data():

    print("=" * 70)
    print("BAGHEWALA DIGITAL TWIN")
    print("AI MULTI-OBJECTIVE OPTIMIZATION ENGINE")
    print("=" * 70)

    df = pd.read_csv(DATA_PATH)

    df["date"] = pd.to_datetime(df["date"])

    df = df.sort_values(
        ["well_id", "date"]
    ).reset_index(drop=True)

    print("\nDataset loaded successfully!")
    print("Rows:", len(df))
    print("Wells:", df["well_id"].nunique())

    return df


# ============================================================
# LOAD MODELS
# ============================================================

def load_models():

    print("\n" + "=" * 70)
    print("LOADING AI MODELS")
    print("=" * 70)

    production_model = joblib.load(
        PRODUCTION_MODEL_PATH
    )

    print("\nLoaded:")
    print("  Production prediction model")

    risk_models = {}

    for name, path in RISK_MODEL_PATHS.items():

        risk_models[name] = joblib.load(path)

        print(
            "  "
            + name.replace("_", " ").title()
            + " risk model"
        )

    return production_model, risk_models


# ============================================================
# GET LATEST WELL DATA
# ============================================================

def get_latest_well_data(df, well_id):

    well_data = df[
        df["well_id"] == well_id
    ].sort_values("date")

    if well_data.empty:
        return None

    return well_data.iloc[-1]


# ============================================================
# GET WELL HISTORY
# ============================================================

def get_well_history(df, well_id):

    well_history = df[
        df["well_id"] == well_id
    ].sort_values("date").copy()

    return well_history.reset_index(drop=True)


# ============================================================
# GET HISTORICAL VALUES
# ============================================================

def get_historical_features(
    well_history,
    column
):

    values = well_history[column]

    # Current row is the last row.
    # Lag 1 = previous day.
    if len(values) >= 2:
        lag1 = values.iloc[-2]
    else:
        lag1 = values.iloc[-1]

    # Lag 7 = seven days before current row.
    if len(values) >= 8:
        lag7 = values.iloc[-8]
    else:
        lag7 = values.iloc[0]

    # Previous 7 observations.
    if len(values) >= 8:
        previous_values = values.iloc[-8:-1]
    else:
        previous_values = values.iloc[:-1]

    if len(previous_values) == 0:
        rolling_mean = values.iloc[-1]
    else:
        rolling_mean = previous_values.mean()

    return lag1, lag7, rolling_mean


# ============================================================
# CREATE BASE PRODUCTION FEATURE ROW
# ============================================================

def create_base_production_features(
    row,
    well_history
):

    features = {}

    # --------------------------------------------------------
    # Current operating parameters
    # --------------------------------------------------------

    features["steam_volume"] = row["steam_volume"]

    features["injection_pressure"] = (
        row["injection_pressure"]
    )

    features["soak_time"] = row["soak_time"]

    features["production_cutoff"] = (
        row["production_cutoff"]
    )

    features["reservoir_temperature"] = (
        row["reservoir_temperature"]
    )

    features["reservoir_pressure"] = (
        row["reservoir_pressure"]
    )

    features["oil_viscosity"] = (
        row["oil_viscosity"]
    )

    features["oil_api"] = row["oil_api"]

    features["days_since_steam"] = (
        row["days_since_steam"]
    )

    features["water_cut"] = row["water_cut"]

    features["fluid_level"] = (
        row["fluid_level"]
    )

    features["stroke_length"] = (
        row["stroke_length"]
    )

    features["spm"] = row["spm"]

    features["vfd_frequency"] = (
        row["vfd_frequency"]
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

    for column in historical_columns:

        lag1, lag7, rolling_mean = (
            get_historical_features(
                well_history,
                column
            )
        )

        features[
            f"{column}_lag1"
        ] = lag1

        features[
            f"{column}_lag7"
        ] = lag7

        features[
            f"{column}_roll7_mean"
        ] = rolling_mean

    # --------------------------------------------------------
    # Physics-inspired features
    # --------------------------------------------------------

    features["temp_viscosity_ratio"] = (
        row["reservoir_temperature"]
        / (row["oil_viscosity"] + 1e-6)
    )

    features["pressure_temperature_index"] = (
        row["reservoir_pressure"]
        * row["reservoir_temperature"]
    )

    features["pump_speed_index"] = (
        row["stroke_length"]
        * row["spm"]
    )

    features["vfd_load_index"] = (
        row["vfd_frequency"]
        * row["spm"]
    )

    features["thermal_decay_proxy"] = (
        row["days_since_steam"]
        / (row["reservoir_temperature"] + 1e-6)
    )

    features["viscosity_pressure_index"] = (
        row["oil_viscosity"]
        / (row["reservoir_pressure"] + 1e-6)
    )

    features["thermal_mobility_proxy"] = (
        row["reservoir_temperature"]
        / (row["oil_viscosity"] + 1e-6)
    )

    return features


# ============================================================
# PRODUCTION FEATURE ORDER
# ============================================================

PRODUCTION_FEATURES = [
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


# ============================================================
# RISK FEATURE ORDER
# ============================================================

RISK_FEATURES = [
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
    "vfd_frequency"
]


# ============================================================
# CREATE RISK FEATURES
# ============================================================

def create_risk_dataframe(
    base_row,
    candidates
):

    rows = []

    for _, candidate in candidates.iterrows():

        row = base_row.copy()

        row["steam_volume"] = (
            candidate["steam_volume"]
        )

        row["injection_pressure"] = (
            candidate["injection_pressure"]
        )

        row["soak_time"] = (
            candidate["soak_time"]
        )

        row["stroke_length"] = (
            candidate["stroke_length"]
        )

        row["spm"] = candidate["spm"]

        row["vfd_frequency"] = (
            candidate["vfd_frequency"]
        )

        rows.append(
            [
                row[column]
                for column in RISK_FEATURES
            ]
        )

    return pd.DataFrame(
        rows,
        columns=RISK_FEATURES
    )


# ============================================================
# CREATE PRODUCTION CANDIDATE DATAFRAME
# ============================================================

def create_production_dataframe(
    base_features,
    candidates
):

    rows = []

    for _, candidate in candidates.iterrows():

        features = base_features.copy()

        # ----------------------------------------------------
        # Replace optimization variables
        # ----------------------------------------------------

        features["steam_volume"] = (
            candidate["steam_volume"]
        )

        features["injection_pressure"] = (
            candidate["injection_pressure"]
        )

        features["soak_time"] = (
            candidate["soak_time"]
        )

        features["stroke_length"] = (
            candidate["stroke_length"]
        )

        features["spm"] = candidate["spm"]

        features["vfd_frequency"] = (
            candidate["vfd_frequency"]
        )

        # ----------------------------------------------------
        # Recalculate features affected by SRP settings
        # ----------------------------------------------------

        features["pump_speed_index"] = (
            features["stroke_length"]
            * features["spm"]
        )

        features["vfd_load_index"] = (
            features["vfd_frequency"]
            * features["spm"]
        )

        rows.append(
            [
                features[column]
                for column in PRODUCTION_FEATURES
            ]
        )

    return pd.DataFrame(
        rows,
        columns=PRODUCTION_FEATURES
    )


# ============================================================
# SAFE POSITIVE CLASS PROBABILITY
# ============================================================

def get_positive_probabilities(
    model,
    X
):

    probabilities = model.predict_proba(X)

    classes = list(model.classes_)

    if 1 in classes:

        positive_index = classes.index(1)

        return probabilities[
            :,
            positive_index
        ]

    return np.zeros(
        len(X)
    )


# ============================================================
# GENERATE CANDIDATES
# ============================================================

def generate_candidates(df):

    print("\n" + "=" * 70)
    print("GENERATING CANDIDATE OPERATING CONDITIONS")
    print("=" * 70)

    parameters = [
        "steam_volume",
        "injection_pressure",
        "soak_time",
        "stroke_length",
        "spm",
        "vfd_frequency"
    ]

    ranges = {}

    for parameter in parameters:

        minimum = df[
            parameter
        ].quantile(0.10)

        maximum = df[
            parameter
        ].quantile(0.90)

        ranges[parameter] = (
            minimum,
            maximum
        )

        print(
            f"{parameter:25s}: "
            f"{minimum:.2f} - {maximum:.2f}"
        )

    rng = np.random.default_rng(
        RANDOM_SEED
    )

    candidate_data = {}

    for parameter in parameters:

        minimum, maximum = (
            ranges[parameter]
        )

        candidate_data[
            parameter
        ] = rng.uniform(
            minimum,
            maximum,
            NUMBER_OF_CANDIDATES
        )

    candidates = pd.DataFrame(
        candidate_data
    )

    return candidates


# ============================================================
# MIN-MAX NORMALIZATION
# ============================================================

def min_max_normalize(series):

    minimum = series.min()
    maximum = series.max()

    if maximum - minimum < 1e-12:

        return pd.Series(
            np.ones(
                len(series)
            ),
            index=series.index
        )

    return (
        (series - minimum)
        / (maximum - minimum)
    )


# ============================================================
# RUN AI OPTIMIZATION
# ============================================================

def optimize_well(
    df,
    row,
    well_history,
    production_model,
    risk_models
):

    # --------------------------------------------------------
    # Generate candidates
    # --------------------------------------------------------

    candidates = generate_candidates(
        df
    )

    print("\nCreating model input matrices...")

    # --------------------------------------------------------
    # Production features
    # --------------------------------------------------------

    base_features = (
        create_base_production_features(
            row,
            well_history
        )
    )

    production_X = (
        create_production_dataframe(
            base_features,
            candidates
        )
    )

    # --------------------------------------------------------
    # Risk features
    # --------------------------------------------------------

    risk_X = create_risk_dataframe(
        row,
        candidates
    )

    print(
        "Production feature matrix:",
        production_X.shape
    )

    print(
        "Risk feature matrix:",
        risk_X.shape
    )

    # ========================================================
    # PRODUCTION MODEL
    # ========================================================

    print(
        "\nRunning production AI..."
    )

    predicted_production = (
        production_model.predict(
            production_X
        )
    )

    print(
        "Production predictions completed."
    )

    # ========================================================
    # ROD FLOATING MODEL
    # ========================================================

    print(
        "Running rod floating risk AI..."
    )

    rod_probability = (
        get_positive_probabilities(
            risk_models["rod_floating"],
            risk_X
        )
    )

    print(
        "Rod floating predictions completed."
    )

    # ========================================================
    # IMPACT LOADING MODEL
    # ========================================================

    print(
        "Running impact loading risk AI..."
    )

    impact_probability = (
        get_positive_probabilities(
            risk_models["impact_loading"],
            risk_X
        )
    )

    print(
        "Impact loading predictions completed."
    )

    # ========================================================
    # PUMP UNSETTING MODEL
    # ========================================================

    print(
        "Running pump unsetting risk AI..."
    )

    pump_probability = (
        get_positive_probabilities(
            risk_models["pump_unsetting"],
            risk_X
        )
    )

    print(
        "Pump unsetting predictions completed."
    )

    # ========================================================
    # BUILD RESULTS
    # ========================================================

    results_df = candidates.copy()

    results_df[
        "predicted_oil_production"
    ] = predicted_production

    results_df[
        "rod_floating_probability"
    ] = rod_probability

    results_df[
        "impact_loading_probability"
    ] = impact_probability

    results_df[
        "pump_unsetting_probability"
    ] = pump_probability

    # ========================================================
    # COMBINED MECHANICAL RISK
    # ========================================================

    results_df[
        "mechanical_risk"
    ] = (
        0.40
        * results_df[
            "rod_floating_probability"
        ]
        +
        0.35
        * results_df[
            "impact_loading_probability"
        ]
        +
        0.25
        * results_df[
            "pump_unsetting_probability"
        ]
    )

    # ========================================================
    # ESTIMATED SOR
    # ========================================================

    results_df[
        "estimated_steam_oil_ratio"
    ] = (
        results_df["steam_volume"]
        /
        results_df[
            "predicted_oil_production"
        ].clip(lower=0.1)
    )

    # ========================================================
    # PUMP LOAD INDICATOR
    # ========================================================

    max_stroke = max(
        df["stroke_length"].max(),
        1
    )

    max_spm = max(
        df["spm"].max(),
        1
    )

    max_vfd = max(
        df["vfd_frequency"].max(),
        1
    )

    results_df[
        "pump_load_indicator"
    ] = (
        results_df["stroke_length"]
        / max_stroke
    ) * (
        results_df["spm"]
        / max_spm
    ) * (
        results_df["vfd_frequency"]
        / max_vfd
    )

    # ========================================================
    # OBJECTIVE SCORES
    # ========================================================

    results_df[
        "production_score"
    ] = min_max_normalize(
        results_df[
            "predicted_oil_production"
        ]
    )

    sor_normalized = (
        min_max_normalize(
            results_df[
                "estimated_steam_oil_ratio"
            ]
        )
    )

    results_df[
        "sor_score"
    ] = 1 - sor_normalized

    results_df[
        "risk_score"
    ] = 1 - results_df[
        "mechanical_risk"
    ]

    pump_load_normalized = (
        min_max_normalize(
            results_df[
                "pump_load_indicator"
            ]
        )
    )

    results_df[
        "pump_load_score"
    ] = 1 - pump_load_normalized

    # ========================================================
    # FINAL SCORE
    # ========================================================

    results_df[
        "optimization_score"
    ] = (
        0.50
        * results_df[
            "production_score"
        ]
        +
        0.20
        * results_df[
            "sor_score"
        ]
        +
        0.20
        * results_df[
            "risk_score"
        ]
        +
        0.10
        * results_df[
            "pump_load_score"
        ]
    )

    results_df = (
        results_df
        .sort_values(
            "optimization_score",
            ascending=False
        )
        .reset_index(drop=True)
    )

    return results_df


# ============================================================
# CURRENT WELL AI ASSESSMENT
# ============================================================

def calculate_current_condition(
    row,
    well_history,
    production_model,
    risk_models
):

    # --------------------------------------------------------
    # Production
    # --------------------------------------------------------

    base_features = (
        create_base_production_features(
            row,
            well_history
        )
    )

    production_X = pd.DataFrame(
        [[
            base_features[column]
            for column in PRODUCTION_FEATURES
        ]],
        columns=PRODUCTION_FEATURES
    )

    production = production_model.predict(
        production_X
    )[0]

    # --------------------------------------------------------
    # Risks
    # --------------------------------------------------------

    risk_X = pd.DataFrame(
        [[
            row[column]
            for column in RISK_FEATURES
        ]],
        columns=RISK_FEATURES
    )

    rod_risk = get_positive_probabilities(
        risk_models["rod_floating"],
        risk_X
    )[0]

    impact_risk = get_positive_probabilities(
        risk_models["impact_loading"],
        risk_X
    )[0]

    pump_risk = get_positive_probabilities(
        risk_models["pump_unsetting"],
        risk_X
    )[0]

    mechanical_risk = (
        0.40 * rod_risk
        +
        0.35 * impact_risk
        +
        0.25 * pump_risk
    )

    return {
        "production": production,
        "rod_floating": rod_risk,
        "impact_loading": impact_risk,
        "pump_unsetting": pump_risk,
        "mechanical_risk": mechanical_risk
    }


# ============================================================
# DISPLAY RESULTS
# ============================================================

def display_results(
    well_id,
    row,
    current_condition,
    results_df
):

    best = results_df.iloc[0]

    current_production = (
        current_condition["production"]
    )

    optimized_production = (
        best["predicted_oil_production"]
    )

    if abs(current_production) > 1e-9:

        improvement = (
            (
                optimized_production
                - current_production
            )
            / current_production
        ) * 100

    else:

        improvement = 0

    # ========================================================
    # CURRENT
    # ========================================================

    print("\n" + "=" * 70)
    print("CURRENT WELL CONDITION")
    print("=" * 70)

    print(
        f"\nWell ID              : "
        f"{well_id}"
    )

    print(
        f"Latest Date         : "
        f"{row['date'].date()}"
    )

    print(
        f"\nReservoir Temperature : "
        f"{row['reservoir_temperature']:.2f}"
    )

    print(
        f"Reservoir Pressure    : "
        f"{row['reservoir_pressure']:.2f}"
    )

    print(
        f"Oil Viscosity         : "
        f"{row['oil_viscosity']:.2f}"
    )

    print(
        f"Water Cut             : "
        f"{row['water_cut']:.2f}"
    )

    print(
        f"Stroke Length         : "
        f"{row['stroke_length']:.2f}"
    )

    print(
        f"SPM                   : "
        f"{row['spm']:.2f}"
    )

    print(
        f"VFD Frequency         : "
        f"{row['vfd_frequency']:.2f}"
    )

    print("\nAI CURRENT ASSESSMENT")
    print("-" * 70)

    print(
        f"Predicted Production  : "
        f"{current_production:.2f}"
    )

    print(
        f"Rod Floating Risk     : "
        f"{current_condition['rod_floating'] * 100:.2f}%"
    )

    print(
        f"Impact Loading Risk   : "
        f"{current_condition['impact_loading'] * 100:.2f}%"
    )

    print(
        f"Pump Unsetting Risk   : "
        f"{current_condition['pump_unsetting'] * 100:.2f}%"
    )

    print(
        f"Combined SRP Risk     : "
        f"{current_condition['mechanical_risk'] * 100:.2f}%"
    )

    # ========================================================
    # RECOMMENDED
    # ========================================================

    print("\n" + "=" * 70)
    print("AI RECOMMENDED OPERATING CONDITION")
    print("=" * 70)

    print(
        f"\nSteam Volume          : "
        f"{best['steam_volume']:.2f}"
    )

    print(
        f"Injection Pressure    : "
        f"{best['injection_pressure']:.2f}"
    )

    print(
        f"Soak Time             : "
        f"{best['soak_time']:.2f}"
    )

    print(
        f"Stroke Length         : "
        f"{best['stroke_length']:.2f}"
    )

    print(
        f"SPM                   : "
        f"{best['spm']:.2f}"
    )

    print(
        f"VFD Frequency         : "
        f"{best['vfd_frequency']:.2f}"
    )

    print("\nAI PREDICTED RESULTS")
    print("-" * 70)

    print(
        f"Predicted Production  : "
        f"{best['predicted_oil_production']:.2f}"
    )

    print(
        f"Estimated SOR         : "
        f"{best['estimated_steam_oil_ratio']:.2f}"
    )

    print(
        f"Rod Floating Risk     : "
        f"{best['rod_floating_probability'] * 100:.2f}%"
    )

    print(
        f"Impact Loading Risk   : "
        f"{best['impact_loading_probability'] * 100:.2f}%"
    )

    print(
        f"Pump Unsetting Risk   : "
        f"{best['pump_unsetting_probability'] * 100:.2f}%"
    )

    print(
        f"Combined SRP Risk     : "
        f"{best['mechanical_risk'] * 100:.2f}%"
    )

    print(
        f"Optimization Score    : "
        f"{best['optimization_score']:.4f}"
    )

    print(
        f"\nEstimated Production Improvement : "
        f"{improvement:.2f}%"
    )

    # ========================================================
    # TOP 10
    # ========================================================

    print("\n" + "=" * 70)
    print("TOP 10 AI RECOMMENDATIONS")
    print("=" * 70)

    columns = [
        "steam_volume",
        "injection_pressure",
        "soak_time",
        "stroke_length",
        "spm",
        "vfd_frequency",
        "predicted_oil_production",
        "rod_floating_probability",
        "impact_loading_probability",
        "pump_unsetting_probability",
        "mechanical_risk",
        "estimated_steam_oil_ratio",
        "optimization_score"
    ]

    print(
        results_df[
            columns
        ]
        .head(10)
        .round(3)
        .to_string(index=False)
    )


# ============================================================
# SAVE RESULTS
# ============================================================

def save_results(
    well_id,
    results_df
):

    os.makedirs(
        OUTPUT_DIR,
        exist_ok=True
    )

    output_path = os.path.join(
        OUTPUT_DIR,
        f"optimization_results_{well_id}.csv"
    )

    results_df.to_csv(
        output_path,
        index=False
    )

    print("\n" + "=" * 70)
    print("RESULTS SAVED")
    print("=" * 70)

    print(
        f"\nOutput file:"
        f"\n{output_path}"
    )

    print(
        f"\nConfigurations evaluated: "
        f"{len(results_df)}"
    )


# ============================================================
# MAIN
# ============================================================

def main():

    # --------------------------------------------------------
    # Load data
    # --------------------------------------------------------

    df = load_data()

    # --------------------------------------------------------
    # Load models
    # --------------------------------------------------------

    production_model, risk_models = (
        load_models()
    )

    # --------------------------------------------------------
    # Available wells
    # --------------------------------------------------------

    available_wells = sorted(
        df["well_id"].unique()
    )

    print("\nAvailable wells:")
    print(
        ", ".join(
            available_wells
        )
    )

    # --------------------------------------------------------
    # Select well
    # --------------------------------------------------------

    well_id = input(
        "\nEnter Well ID (example: BGH-001): "
    ).strip().upper()

    if well_id not in available_wells:

        print(
            "\nERROR: Invalid Well ID."
        )

        return

    # --------------------------------------------------------
    # Latest row
    # --------------------------------------------------------

    row = get_latest_well_data(
        df,
        well_id
    )

    if row is None:

        print(
            "\nERROR: Well data not found."
        )

        return

    # --------------------------------------------------------
    # Well history
    # --------------------------------------------------------

    well_history = get_well_history(
        df,
        well_id
    )

    # --------------------------------------------------------
    # Current condition
    # --------------------------------------------------------

    current_condition = (
        calculate_current_condition(
            row,
            well_history,
            production_model,
            risk_models
        )
    )

    # --------------------------------------------------------
    # Optimization
    # --------------------------------------------------------

    print("\n" + "=" * 70)
    print("RUNNING MULTI-OBJECTIVE AI OPTIMIZATION")
    print("=" * 70)

    print(
        f"\nEvaluating "
        f"{NUMBER_OF_CANDIDATES} candidate configurations..."
    )

    results_df = optimize_well(
        df,
        row,
        well_history,
        production_model,
        risk_models
    )

    # --------------------------------------------------------
    # Display
    # --------------------------------------------------------

    display_results(
        well_id,
        row,
        current_condition,
        results_df
    )

    # --------------------------------------------------------
    # Save
    # --------------------------------------------------------

    save_results(
        well_id,
        results_df
    )

    # --------------------------------------------------------
    # Final
    # --------------------------------------------------------

    print("\n" + "=" * 70)
    print("AI OPTIMIZATION COMPLETED SUCCESSFULLY")
    print("=" * 70)

    print(
        "\nIMPORTANT:"
        "\nThis is a prototype using physics-informed"
        "\nsynthetic/demo data."
        "\nThe recommended settings are NOT field-approved"
        "\noperating instructions."
    )


# ============================================================
# RUN
# ============================================================

if __name__ == "__main__":
    main()