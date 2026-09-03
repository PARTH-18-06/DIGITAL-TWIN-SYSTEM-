import os
import pandas as pd
import joblib

from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    roc_auc_score
)


# ============================================================
# CONFIGURATION
# ============================================================

DATA_PATH = "data/baghewala_synthetic_dataset_v1.csv"

MODEL_DIR = "models"
OUTPUT_DIR = "outputs"

RANDOM_STATE = 42

# ------------------------------------------------------------
# Instead of using an absolute risk threshold such as 0.50,
# classify the highest-risk portion of the synthetic data
# as "high risk".
#
# 0.75 means approximately the top 25% are high risk.
# ------------------------------------------------------------

HIGH_RISK_QUANTILE = 0.75


# ============================================================
# FEATURES
#
# IMPORTANT:
# Existing risk columns are NOT used as model inputs.
#
# This prevents direct target leakage.
# ============================================================

FEATURES = [

    # --------------------------------------------------------
    # CSS parameters
    # --------------------------------------------------------

    "steam_volume",
    "injection_pressure",
    "soak_time",
    "production_cutoff",

    # --------------------------------------------------------
    # Reservoir / fluid
    # --------------------------------------------------------

    "reservoir_temperature",
    "reservoir_pressure",
    "oil_viscosity",
    "oil_api",
    "days_since_steam",
    "water_cut",
    "fluid_level",

    # --------------------------------------------------------
    # SRP operating parameters
    # --------------------------------------------------------

    "stroke_length",
    "spm",
    "vfd_frequency",
]


# ============================================================
# TARGETS
# ============================================================

TARGETS = {

    "rod_floating": "rod_floating_risk",

    "impact_loading": "impact_loading_risk",

    "pump_unsetting": "pump_unsetting_risk",
}


# ============================================================
# LOAD DATA
# ============================================================

def load_data():

    print("\n" + "=" * 70)
    print("LOADING SRP RISK DATA")
    print("=" * 70)

    if not os.path.exists(DATA_PATH):

        print("\nERROR: Dataset not found.")

        print("Expected:")
        print(DATA_PATH)

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

    print(
        "\nDataset loaded successfully."
    )

    print(
        "Rows:",
        len(df)
    )

    print(
        "Wells:",
        df["well_id"].nunique()
    )

    return df


# ============================================================
# PREPARE FEATURES
# ============================================================

def prepare_features(df):

    print(
        "\nPreparing features..."
    )

    X = df[
        FEATURES
    ].copy()

    print(
        "Number of input features:",
        len(FEATURES)
    )

    return X


# ============================================================
# CREATE DATA-DRIVEN BINARY TARGET
# ============================================================

def create_target(
    df,
    target_column
):

    risk_values = df[
        target_column
    ]

    # --------------------------------------------------------
    # Inspect distribution
    # --------------------------------------------------------

    print(
        "\nRisk score statistics:"
    )

    print(
        risk_values.describe()
        .to_string()
    )

    # --------------------------------------------------------
    # Calculate threshold from the dataset.
    #
    # Values above the 75th percentile are classified as
    # high risk.
    # --------------------------------------------------------

    threshold = risk_values.quantile(
        HIGH_RISK_QUANTILE
    )

    print(
        "\nHigh-risk threshold:"
    )

    print(
        f"{threshold:.6f}"
    )

    y = (
        risk_values
        >= threshold
    ).astype(int)

    print(
        "\nBinary target distribution:"
    )

    print(
        y.value_counts()
        .sort_index()
        .to_string()
    )

    # --------------------------------------------------------
    # Safety check
    # --------------------------------------------------------

    unique_classes = y.nunique()

    if unique_classes < 2:

        print(
            "\nWARNING:"
        )

        print(
            "The target still contains only one class."
        )

        print(
            "This risk target cannot be trained "
            "as a binary classifier."
        )

        return None

    return y


# ============================================================
# TIME-BASED TRAIN / TEST SPLIT
# ============================================================

def split_data(
    df,
    X,
    y
):

    split_date = df[
        "date"
    ].quantile(
        0.80
    )

    train_mask = (
        df["date"]
        <= split_date
    )

    test_mask = (
        df["date"]
        > split_date
    )

    X_train = X.loc[
        train_mask
    ]

    X_test = X.loc[
        test_mask
    ]

    y_train = y.loc[
        train_mask
    ]

    y_test = y.loc[
        test_mask
    ]

    print(
        "\nTraining rows:"
    )

    print(
        len(X_train)
    )

    print(
        "Testing rows:",
        len(X_test)
    )

    print(
        "\nTraining period:"
    )

    print(
        df.loc[
            train_mask,
            "date"
        ].min(),
        "to",
        df.loc[
            train_mask,
            "date"
        ].max()
    )

    print(
        "\nTesting period:"
    )

    print(
        df.loc[
            test_mask,
            "date"
        ].min(),
        "to",
        df.loc[
            test_mask,
            "date"
        ].max()
    )

    print(
        "\nTraining target distribution:"
    )

    print(
        y_train.value_counts()
        .sort_index()
        .to_string()
    )

    print(
        "\nTesting target distribution:"
    )

    print(
        y_test.value_counts()
        .sort_index()
        .to_string()
    )

    return (
        X_train,
        X_test,
        y_train,
        y_test
    )


# ============================================================
# TRAIN ONE RISK MODEL
# ============================================================

def train_risk_model(
    risk_name,
    target_column,
    df,
    X
):

    print(
        "\n" + "=" * 70
    )

    print(
        f"TRAINING MODEL: "
        f"{risk_name.upper()}"
    )

    print(
        "=" * 70
    )

    # --------------------------------------------------------
    # Create target
    # --------------------------------------------------------

    y = create_target(
        df,
        target_column
    )

    if y is None:

        return (
            None,
            None
        )

    # --------------------------------------------------------
    # Split data
    # --------------------------------------------------------

    (
        X_train,
        X_test,
        y_train,
        y_test
    ) = split_data(
        df,
        X,
        y
    )

    # --------------------------------------------------------
    # Check training classes
    # --------------------------------------------------------

    if y_train.nunique() < 2:

        print(
            "\nERROR:"
        )

        print(
            "Training data contains only one class."
        )

        print(
            "Skipping this model."
        )

        return (
            None,
            None
        )

    # --------------------------------------------------------
    # Random Forest
    # --------------------------------------------------------

    model = RandomForestClassifier(

        n_estimators=300,

        max_depth=15,

        min_samples_split=5,

        class_weight="balanced",

        random_state=RANDOM_STATE,

        n_jobs=-1
    )

    print(
        "\nTraining Random Forest..."
    )

    model.fit(
        X_train,
        y_train
    )

    # --------------------------------------------------------
    # Predictions
    # --------------------------------------------------------

    predictions = model.predict(
        X_test
    )

    # --------------------------------------------------------
    # Probability handling
    # --------------------------------------------------------

    probabilities = None

    if (
        hasattr(
            model,
            "predict_proba"
        )
        and len(model.classes_) >= 2
    ):

        # Find the probability column
        # corresponding to class 1.

        positive_class_index = list(
            model.classes_
        ).index(1)

        probabilities = (
            model.predict_proba(
                X_test
            )[
                :,
                positive_class_index
            ]
        )

    # --------------------------------------------------------
    # Classification metrics
    # --------------------------------------------------------

    accuracy = accuracy_score(
        y_test,
        predictions
    )

    precision = precision_score(
        y_test,
        predictions,
        zero_division=0
    )

    recall = recall_score(
        y_test,
        predictions,
        zero_division=0
    )

    f1 = f1_score(
        y_test,
        predictions,
        zero_division=0
    )

    if (
        probabilities is not None
        and y_test.nunique() >= 2
    ):

        roc_auc = roc_auc_score(
            y_test,
            probabilities
        )

    else:

        roc_auc = None

    # --------------------------------------------------------
    # Display performance
    # --------------------------------------------------------

    print(
        "\nMODEL PERFORMANCE"
    )

    print(
        f"Accuracy  : "
        f"{accuracy:.4f}"
    )

    print(
        f"Precision : "
        f"{precision:.4f}"
    )

    print(
        f"Recall    : "
        f"{recall:.4f}"
    )

    print(
        f"F1 Score  : "
        f"{f1:.4f}"
    )

    if roc_auc is not None:

        print(
            f"ROC-AUC   : "
            f"{roc_auc:.4f}"
        )

    else:

        print(
            "ROC-AUC   : "
            "Not available"
        )

    # --------------------------------------------------------
    # Feature importance
    # --------------------------------------------------------

    importance_df = pd.DataFrame({

        "feature":
            FEATURES,

        "importance":
            model.feature_importances_
    })

    importance_df = (
        importance_df
        .sort_values(
            "importance",
            ascending=False
        )
        .reset_index(
            drop=True
        )
    )

    print(
        "\nTop 10 features:"
    )

    print(
        importance_df
        .head(10)
        .to_string(
            index=False
        )
    )

    # --------------------------------------------------------
    # Create directories
    # --------------------------------------------------------

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

    model_filename = (
        f"{risk_name}_risk_model.pkl"
    )

    model_path = os.path.join(
        MODEL_DIR,
        model_filename
    )

    joblib.dump(
        model,
        model_path
    )

    print(
        "\nModel saved to:"
    )

    print(
        model_path
    )

    # --------------------------------------------------------
    # Save feature importance
    # --------------------------------------------------------

    importance_filename = (
        f"{risk_name}"
        "_risk_feature_importance.csv"
    )

    importance_path = os.path.join(
        OUTPUT_DIR,
        importance_filename
    )

    importance_df.to_csv(
        importance_path,
        index=False
    )

    # --------------------------------------------------------
    # Save metrics
    # --------------------------------------------------------

    metrics = {

        "model":
            risk_name,

        "accuracy":
            accuracy,

        "precision":
            precision,

        "recall":
            recall,

        "f1":
            f1,

        "roc_auc":
            roc_auc
    }

    return (
        model,
        metrics
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
        "SRP EQUIPMENT RISK AI"
    )

    print(
        "=" * 70
    )

    # --------------------------------------------------------
    # Load data
    # --------------------------------------------------------

    df = load_data()

    if df is None:

        return

    # --------------------------------------------------------
    # Prepare features
    # --------------------------------------------------------

    X = prepare_features(
        df
    )

    # --------------------------------------------------------
    # Train models
    # --------------------------------------------------------

    all_metrics = []

    for (
        risk_name,
        target_column
    ) in TARGETS.items():

        (
            model,
            metrics
        ) = train_risk_model(

            risk_name,

            target_column,

            df,

            X
        )

        if (
            model is not None
            and metrics is not None
        ):

            all_metrics.append(
                metrics
            )

    # --------------------------------------------------------
    # Save comparison
    # --------------------------------------------------------

    os.makedirs(
        OUTPUT_DIR,
        exist_ok=True
    )

    if len(all_metrics) > 0:

        metrics_df = pd.DataFrame(
            all_metrics
        )

        metrics_path = os.path.join(
            OUTPUT_DIR,
            "srp_risk_model_comparison.csv"
        )

        metrics_df.to_csv(
            metrics_path,
            index=False
        )

        # ----------------------------------------------------
        # Final summary
        # ----------------------------------------------------

        print(
            "\n" + "=" * 70
        )

        print(
            "SRP RISK MODEL SUMMARY"
        )

        print(
            "=" * 70
        )

        print(
            metrics_df.to_string(
                index=False
            )
        )

        print(
            "\nComparison saved to:"
        )

        print(
            metrics_path
        )

    else:

        print(
            "\nNo models were successfully trained."
        )

    print(
        "\n" + "=" * 70
    )

    print(
        "SRP RISK TRAINING COMPLETED"
    )

    print(
        "=" * 70
    )


# ============================================================
# RUN
# ============================================================

if __name__ == "__main__":

    main()