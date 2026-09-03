import os
import joblib
import pandas as pd


# ============================================================
# CONFIGURATION
# ============================================================

DATA_PATH = "data/baghewala_synthetic_dataset_v1.csv"

MODEL_DIR = "models"


# ============================================================
# MODEL PATHS
# ============================================================

MODEL_PATHS = {

    "rod_floating":
        os.path.join(
            MODEL_DIR,
            "rod_floating_risk_model.pkl"
        ),

    "impact_loading":
        os.path.join(
            MODEL_DIR,
            "impact_loading_risk_model.pkl"
        ),

    "pump_unsetting":
        os.path.join(
            MODEL_DIR,
            "pump_unsetting_risk_model.pkl"
        ),
}


# ============================================================
# FEATURES
# Must match train_srp_risk.py
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
]


# ============================================================
# LOAD DATA
# ============================================================

def load_data():

    if not os.path.exists(DATA_PATH):

        print(
            "\nERROR: Dataset not found."
        )

        print(
            "Expected:"
        )

        print(
            DATA_PATH
        )

        return None

    df = pd.read_csv(
        DATA_PATH
    )

    df["date"] = pd.to_datetime(
        df["date"]
    )

    df = df.sort_values(
        ["well_id", "date"]
    ).reset_index(
        drop=True
    )

    return df


# ============================================================
# LOAD RISK MODELS
# ============================================================

def load_models():

    models = {}

    print(
        "\nLoading SRP risk models..."
    )

    for risk_name, path in MODEL_PATHS.items():

        if not os.path.exists(path):

            print(
                f"\nERROR: Model not found:"
            )

            print(
                path
            )

            return None

        models[risk_name] = joblib.load(
            path
        )

        print(
            f"Loaded: {risk_name}"
        )

    return models


# ============================================================
# GET LATEST WELL CONDITION
# ============================================================

def get_latest_well_data(
    df,
    well_id
):

    well_data = df[
        df["well_id"] == well_id
    ].copy()

    if len(well_data) == 0:

        print(
            f"\nERROR: Well {well_id} "
            "was not found."
        )

        return None

    well_data = well_data.sort_values(
        "date"
    ).reset_index(
        drop=True
    )

    return well_data.iloc[-1].copy()


# ============================================================
# RISK CATEGORY
# ============================================================

def risk_category(
    probability
):

    if probability < 0.33:

        return "LOW"

    elif probability < 0.66:

        return "MEDIUM"

    else:

        return "HIGH"


# ============================================================
# PREDICT RISKS
# ============================================================

def predict_risks(
    models,
    latest
):

    X = pd.DataFrame(
        [
            [
                latest[feature]
                for feature in FEATURES
            ]
        ],
        columns=FEATURES
    )

    results = {}

    # --------------------------------------------------------
    # Predict each risk
    # --------------------------------------------------------

    for risk_name, model in models.items():

        probabilities = model.predict_proba(
            X
        )

        # Find class 1 safely
        if 1 in model.classes_:

            positive_index = list(
                model.classes_
            ).index(1)

            probability = probabilities[
                0,
                positive_index
            ]

        else:

            probability = 0.0

        category = risk_category(
            probability
        )

        results[risk_name] = {

            "probability":
                float(probability),

            "category":
                category
        }

    return results


# ============================================================
# DISPLAY RESULTS
# ============================================================

def display_results(
    well_id,
    latest,
    results
):

    print(
        "\n" + "=" * 70
    )

    print(
        "SRP EQUIPMENT RISK PREDICTION"
    )

    print(
        "=" * 70
    )

    print(
        "\nWell ID:"
    )

    print(
        well_id
    )

    print(
        "\nLatest data date:"
    )

    print(
        latest["date"].strftime(
            "%Y-%m-%d"
        )
    )

    print(
        "\nCURRENT WELL CONDITIONS"
    )

    print(
        "-" * 70
    )

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
        f"Fluid Level           : "
        f"{latest['fluid_level']:.2f}"
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

    print(
        "\n" + "-" * 70
    )

    print(
        "AI RISK ASSESSMENT"
    )

    print(
        "-" * 70
    )

    print(
        f"\nRod Floating:"
    )

    print(
        f"  Probability : "
        f"{results['rod_floating']['probability']:.2%}"
    )

    print(
        f"  Risk Level  : "
        f"{results['rod_floating']['category']}"
    )

    print(
        f"\nImpact Loading:"
    )

    print(
        f"  Probability : "
        f"{results['impact_loading']['probability']:.2%}"
    )

    print(
        f"  Risk Level  : "
        f"{results['impact_loading']['category']}"
    )

    print(
        f"\nPump Unsetting:"
    )

    print(
        f"  Probability : "
        f"{results['pump_unsetting']['probability']:.2%}"
    )

    print(
        f"  Risk Level  : "
        f"{results['pump_unsetting']['category']}"
    )

    print(
        "\n" + "=" * 70
    )


# ============================================================
# MAIN
# ============================================================

def main():

    print(
        "\n" + "=" * 70
    )

    print(
        "BAGHEWALA DIGITAL TWIN"
    )

    print(
        "SRP RISK PREDICTION ENGINE"
    )

    print(
        "=" * 70
    )

    # --------------------------------------------------------
    # Load models
    # --------------------------------------------------------

    models = load_models()

    if models is None:

        return

    # --------------------------------------------------------
    # Load dataset
    # --------------------------------------------------------

    df = load_data()

    if df is None:

        return

    # --------------------------------------------------------
    # Available wells
    # --------------------------------------------------------

    wells = sorted(
        df["well_id"].unique()
    )

    print(
        "\nAvailable wells:"
    )

    print(
        ", ".join(wells)
    )

    print()

    # --------------------------------------------------------
    # Select well
    # --------------------------------------------------------

    well_id = input(
        "Enter Well ID (example: BGH-001): "
    ).strip()

    if well_id not in wells:

        print(
            f"\nERROR: {well_id} "
            "does not exist."
        )

        return

    # --------------------------------------------------------
    # Latest condition
    # --------------------------------------------------------

    latest = get_latest_well_data(
        df,
        well_id
    )

    if latest is None:

        return

    # --------------------------------------------------------
    # Prediction
    # --------------------------------------------------------

    results = predict_risks(
        models,
        latest
    )

    # --------------------------------------------------------
    # Display
    # --------------------------------------------------------

    display_results(
        well_id,
        latest,
        results
    )


# ============================================================
# RUN
# ============================================================

if __name__ == "__main__":

    main()