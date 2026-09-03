import os
import random
from typing import Optional

import joblib
import numpy as np
import pandas as pd

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


# ============================================================
# PATH CONFIGURATION
# ============================================================

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

DATA_PATH = os.path.join(
    BASE_DIR,
    "data",
    "baghewala_synthetic_dataset_v1.csv"
)

MODEL_DIR = os.path.join(BASE_DIR, "models")
OUTPUT_DIR = os.path.join(BASE_DIR, "outputs")


# ============================================================
# MODEL PATHS
# ============================================================

PRODUCTION_MODEL_PATH = os.path.join(
    MODEL_DIR,
    "best_production_model.pkl"
)

ROD_FLOATING_MODEL_PATH = os.path.join(
    MODEL_DIR,
    "rod_floating_risk_model.pkl"
)

IMPACT_LOADING_MODEL_PATH = os.path.join(
    MODEL_DIR,
    "impact_loading_risk_model.pkl"
)

PUMP_UNSETTING_MODEL_PATH = os.path.join(
    MODEL_DIR,
    "pump_unsetting_risk_model.pkl"
)


# ============================================================
# CONSTANTS
# ============================================================

OPTIMIZATION_CANDIDATES = 1000

RISK_LOW_THRESHOLD = 0.33
RISK_MEDIUM_THRESHOLD = 0.66


# ============================================================
# PRODUCTION FEATURES
# MUST MATCH train_production.py
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
    "thermal_mobility_proxy",
]


# ============================================================
# RISK FEATURES
# MUST MATCH train_srp_risk.py
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
    "vfd_frequency",
]


# ============================================================
# OPTIMIZATION PARAMETERS
# ============================================================

OPTIMIZATION_PARAMETERS = [
    "steam_volume",
    "injection_pressure",
    "soak_time",
    "stroke_length",
    "spm",
    "vfd_frequency",
]


# ============================================================
# FASTAPI APPLICATION
# ============================================================

app = FastAPI(
    title="Baghewala Well-to-Surface AI API",
    description=(
        "AI prediction and optimization API for the "
        "Baghewala CSS + SRP Digital Twin prototype."
    ),
    version="1.0.0",
)


# ============================================================
# CORS
# Allows Person 2's frontend/backend to communicate with API
# ============================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# LOAD DATA
# ============================================================

if not os.path.exists(DATA_PATH):
    raise FileNotFoundError(
        f"Dataset not found: {DATA_PATH}"
    )

df = pd.read_csv(DATA_PATH)

df["date"] = pd.to_datetime(df["date"])

df = df.sort_values(
    ["well_id", "date"]
).reset_index(drop=True)


# ============================================================
# LOAD MODELS
# ============================================================

if not os.path.exists(PRODUCTION_MODEL_PATH):
    raise FileNotFoundError(
        f"Production model not found: {PRODUCTION_MODEL_PATH}"
    )

if not os.path.exists(ROD_FLOATING_MODEL_PATH):
    raise FileNotFoundError(
        f"Rod floating model not found: {ROD_FLOATING_MODEL_PATH}"
    )

if not os.path.exists(IMPACT_LOADING_MODEL_PATH):
    raise FileNotFoundError(
        f"Impact loading model not found: {IMPACT_LOADING_MODEL_PATH}"
    )

if not os.path.exists(PUMP_UNSETTING_MODEL_PATH):
    raise FileNotFoundError(
        f"Pump unsetting model not found: {PUMP_UNSETTING_MODEL_PATH}"
    )


production_model = joblib.load(
    PRODUCTION_MODEL_PATH
)

rod_floating_model = joblib.load(
    ROD_FLOATING_MODEL_PATH
)

impact_loading_model = joblib.load(
    IMPACT_LOADING_MODEL_PATH
)

pump_unsetting_model = joblib.load(
    PUMP_UNSETTING_MODEL_PATH
)


# ============================================================
# PYDANTIC REQUEST MODELS
# ============================================================

class WellRequest(BaseModel):
    well_id: str = Field(
        ...,
        description="Well identifier, for example BGH-001"
    )


class PredictionRequest(BaseModel):
    well_id: str = Field(
        ...,
        description="Well identifier"
    )


class OptimizationConstraints(BaseModel):
    steam_volume_min: Optional[float] = None
    steam_volume_max: Optional[float] = None

    injection_pressure_min: Optional[float] = None
    injection_pressure_max: Optional[float] = None

    soak_time_min: Optional[float] = None
    soak_time_max: Optional[float] = None

    stroke_length_min: Optional[float] = None
    stroke_length_max: Optional[float] = None

    spm_min: Optional[float] = None
    spm_max: Optional[float] = None

    vfd_frequency_min: Optional[float] = None
    vfd_frequency_max: Optional[float] = None


class OptimizationRequest(BaseModel):
    well_id: str = Field(
        ...,
        description="Well identifier"
    )

    num_candidates: int = Field(
        default=1000,
        ge=100,
        le=5000,
        description="Number of candidate configurations"
    )

    constraints: Optional[OptimizationConstraints] = None


# ============================================================
# BASIC HELPERS
# ============================================================

def validate_well(well_id: str):

    if well_id not in set(df["well_id"].unique()):
        raise HTTPException(
            status_code=404,
            detail=f"Well '{well_id}' not found."
        )


def get_well_history(well_id: str):

    validate_well(well_id)

    history = df[
        df["well_id"] == well_id
    ].copy()

    history = history.sort_values(
        "date"
    ).reset_index(drop=True)

    return history


def get_latest_row(well_id: str):

    history = get_well_history(well_id)

    return history.iloc[-1]


# ============================================================
# RISK PROBABILITY HELPERS
# ============================================================

def get_positive_probability(model, X):

    probabilities = model.predict_proba(X)

    classes = list(model.classes_)

    if 1 in classes:
        index = classes.index(1)
        return float(probabilities[0][index])

    return 0.0


def risk_category(probability):

    if probability < RISK_LOW_THRESHOLD:
        return "LOW"

    if probability < RISK_MEDIUM_THRESHOLD:
        return "MEDIUM"

    return "HIGH"


# ============================================================
# HISTORICAL PRODUCTION FEATURES
# ============================================================

def create_historical_features(history):

    history = history.copy()

    historical_columns = [
        "reservoir_temperature",
        "reservoir_pressure",
        "oil_viscosity",
        "water_cut",
    ]

    for column in historical_columns:

        history[f"{column}_lag1"] = (
            history[column].shift(1)
        )

        history[f"{column}_lag7"] = (
            history[column].shift(7)
        )

        history[f"{column}_roll7_mean"] = (
            history[column]
            .shift(1)
            .rolling(7)
            .mean()
        )

    return history


# ============================================================
# PRODUCTION FEATURE CREATION
# ============================================================

def create_production_features(history, row):

    history = create_historical_features(history)

    valid_history = history.dropna()

    if len(valid_history) == 0:

        raise HTTPException(
            status_code=500,
            detail="Not enough historical data to create production features."
        )

    latest_features = valid_history.iloc[-1].copy()

    # Use the latest current operating values
    # from the selected row.

    for column in [
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
    ]:

        latest_features[column] = row[column]

    latest_features["temp_viscosity_ratio"] = (
        row["reservoir_temperature"]
        / (row["oil_viscosity"] + 1e-6)
    )

    latest_features["pressure_temperature_index"] = (
        row["reservoir_pressure"]
        * row["reservoir_temperature"]
    )

    latest_features["pump_speed_index"] = (
        row["stroke_length"]
        * row["spm"]
    )

    latest_features["vfd_load_index"] = (
        row["vfd_frequency"]
        * row["spm"]
    )

    latest_features["thermal_decay_proxy"] = (
        row["days_since_steam"]
        / (row["reservoir_temperature"] + 1e-6)
    )

    latest_features["viscosity_pressure_index"] = (
        row["oil_viscosity"]
        / (row["reservoir_pressure"] + 1e-6)
    )

    latest_features["thermal_mobility_proxy"] = (
        row["reservoir_temperature"]
        / (row["oil_viscosity"] + 1e-6)
    )

    feature_row = pd.DataFrame(
        [
            latest_features[PRODUCTION_FEATURES]
        ]
    )

    return feature_row


# ============================================================
# RISK FEATURE CREATION
# ============================================================

def create_risk_features(row):

    feature_row = pd.DataFrame(
        [
            {
                feature: row[feature]
                for feature in RISK_FEATURES
            }
        ]
    )

    return feature_row


# ============================================================
# CURRENT PRODUCTION PREDICTION
# ============================================================

def predict_current_production(well_id):

    history = get_well_history(well_id)

    latest = history.iloc[-1]

    features = create_production_features(
        history,
        latest
    )

    prediction = float(
        production_model.predict(features)[0]
    )

    return prediction


# ============================================================
# CURRENT SRP RISK PREDICTION
# ============================================================

def predict_current_risk(well_id):

    latest = get_latest_row(well_id)

    features = create_risk_features(latest)

    rod_probability = get_positive_probability(
        rod_floating_model,
        features
    )

    impact_probability = get_positive_probability(
        impact_loading_model,
        features
    )

    pump_probability = get_positive_probability(
        pump_unsetting_model,
        features
    )

    combined_risk = (
        rod_probability
        + impact_probability
        + pump_probability
    ) / 3

    return {
        "rod_floating": {
            "probability": rod_probability,
            "percentage": rod_probability * 100,
            "category": risk_category(
                rod_probability
            ),
        },

        "impact_loading": {
            "probability": impact_probability,
            "percentage": impact_probability * 100,
            "category": risk_category(
                impact_probability
            ),
        },

        "pump_unsetting": {
            "probability": pump_probability,
            "percentage": pump_probability * 100,
            "category": risk_category(
                pump_probability
            ),
        },

        "combined_srp_risk": combined_risk,
        "combined_srp_risk_percentage": combined_risk * 100,
        "combined_category": risk_category(
            combined_risk
        ),
    }


# ============================================================
# DATASET QUANTILE BOUNDS
# DEMO SEARCH BOUNDS ONLY
# ============================================================

def get_demo_bounds():

    bounds = {}

    for parameter in OPTIMIZATION_PARAMETERS:

        bounds[parameter] = {
            "min": float(
                df[parameter].quantile(0.10)
            ),

            "max": float(
                df[parameter].quantile(0.90)
            ),
        }

    return bounds


# ============================================================
# APPLY USER CONSTRAINTS
# ============================================================

def apply_constraints(bounds, constraints):

    if constraints is None:
        return bounds

    constraint_map = {
        "steam_volume": (
            constraints.steam_volume_min,
            constraints.steam_volume_max,
        ),

        "injection_pressure": (
            constraints.injection_pressure_min,
            constraints.injection_pressure_max,
        ),

        "soak_time": (
            constraints.soak_time_min,
            constraints.soak_time_max,
        ),

        "stroke_length": (
            constraints.stroke_length_min,
            constraints.stroke_length_max,
        ),

        "spm": (
            constraints.spm_min,
            constraints.spm_max,
        ),

        "vfd_frequency": (
            constraints.vfd_frequency_min,
            constraints.vfd_frequency_max,
        ),
    }

    for parameter, values in constraint_map.items():

        user_min, user_max = values

        if user_min is not None:

            bounds[parameter]["min"] = max(
                bounds[parameter]["min"],
                user_min
            )

        if user_max is not None:

            bounds[parameter]["max"] = min(
                bounds[parameter]["max"],
                user_max
            )

        if (
            bounds[parameter]["min"]
            > bounds[parameter]["max"]
        ):

            raise HTTPException(
                status_code=400,
                detail=(
                    f"Invalid optimization bounds "
                    f"for {parameter}."
                )
            )

    return bounds


# ============================================================
# GENERATE OPTIMIZATION CANDIDATES
# ============================================================

def generate_candidates(
    bounds,
    num_candidates
):

    random.seed(42)

    candidates = pd.DataFrame()

    for parameter in OPTIMIZATION_PARAMETERS:

        candidates[parameter] = np.random.uniform(
            bounds[parameter]["min"],
            bounds[parameter]["max"],
            num_candidates
        )

    return candidates


# ============================================================
# CREATE PRODUCTION DATAFRAME FOR CANDIDATES
# ============================================================

def create_candidate_production_features(
    history,
    latest,
    candidates
):

    history_features = create_historical_features(
        history
    )

    valid_history = history_features.dropna()

    if len(valid_history) == 0:

        raise HTTPException(
            status_code=500,
            detail="Not enough historical data."
        )

    latest_history = valid_history.iloc[-1]

    rows = []

    for _, candidate in candidates.iterrows():

        row = latest_history.copy()

        # Current reservoir state
        row["reservoir_temperature"] = latest[
            "reservoir_temperature"
        ]

        row["reservoir_pressure"] = latest[
            "reservoir_pressure"
        ]

        row["oil_viscosity"] = latest[
            "oil_viscosity"
        ]

        row["oil_api"] = latest[
            "oil_api"
        ]

        row["days_since_steam"] = latest[
            "days_since_steam"
        ]

        row["water_cut"] = latest[
            "water_cut"
        ]

        row["fluid_level"] = latest[
            "fluid_level"
        ]

        row["production_cutoff"] = latest[
            "production_cutoff"
        ]

        # Candidate parameters
        for parameter in OPTIMIZATION_PARAMETERS:

            row[parameter] = candidate[
                parameter
            ]

        row["temp_viscosity_ratio"] = (
            row["reservoir_temperature"]
            / (row["oil_viscosity"] + 1e-6)
        )

        row["pressure_temperature_index"] = (
            row["reservoir_pressure"]
            * row["reservoir_temperature"]
        )

        row["pump_speed_index"] = (
            row["stroke_length"]
            * row["spm"]
        )

        row["vfd_load_index"] = (
            row["vfd_frequency"]
            * row["spm"]
        )

        row["thermal_decay_proxy"] = (
            row["days_since_steam"]
            / (
                row["reservoir_temperature"]
                + 1e-6
            )
        )

        row["viscosity_pressure_index"] = (
            row["oil_viscosity"]
            / (
                row["reservoir_pressure"]
                + 1e-6
            )
        )

        row["thermal_mobility_proxy"] = (
            row["reservoir_temperature"]
            / (
                row["oil_viscosity"]
                + 1e-6
            )
        )

        rows.append(
            row[PRODUCTION_FEATURES]
        )

    return pd.DataFrame(rows)


# ============================================================
# CREATE RISK DATAFRAME FOR CANDIDATES
# ============================================================

def create_candidate_risk_features(
    latest,
    candidates
):

    rows = []

    for _, candidate in candidates.iterrows():

        row = {}

        for feature in RISK_FEATURES:

            if feature in OPTIMIZATION_PARAMETERS:

                row[feature] = candidate[
                    feature
                ]

            else:

                row[feature] = latest[
                    feature
                ]

        rows.append(row)

    return pd.DataFrame(rows)


# ============================================================
# OPTIMIZATION
# ============================================================

def optimize_well(
    well_id,
    num_candidates=OPTIMIZATION_CANDIDATES,
    constraints=None
):

    history = get_well_history(well_id)

    latest = history.iloc[-1]

    # --------------------------------------------------------
    # Current prediction
    # --------------------------------------------------------

    current_production = predict_current_production(
        well_id
    )

    current_risk = predict_current_risk(
        well_id
    )

    # --------------------------------------------------------
    # Bounds
    # --------------------------------------------------------

    bounds = get_demo_bounds()

    bounds = apply_constraints(
        bounds,
        constraints
    )

    # --------------------------------------------------------
    # Candidate generation
    # --------------------------------------------------------

    candidates = generate_candidates(
        bounds,
        num_candidates
    )

    # --------------------------------------------------------
    # Production predictions
    # --------------------------------------------------------

    production_features = (
        create_candidate_production_features(
            history,
            latest,
            candidates
        )
    )

    production_predictions = (
        production_model.predict(
            production_features
        )
    )

    candidates[
        "predicted_oil_production"
    ] = production_predictions

    # --------------------------------------------------------
    # Risk predictions
    # --------------------------------------------------------

    risk_features = (
        create_candidate_risk_features(
            latest,
            candidates
        )
    )

    rod_probabilities = np.zeros(
        len(candidates)
    )

    impact_probabilities = np.zeros(
        len(candidates)
    )

    pump_probabilities = np.zeros(
        len(candidates)
    )

    for index in range(len(candidates)):

        row = risk_features.iloc[
            index:index + 1
        ]

        rod_probabilities[index] = (
            get_positive_probability(
                rod_floating_model,
                row
            )
        )

        impact_probabilities[index] = (
            get_positive_probability(
                impact_loading_model,
                row
            )
        )

        pump_probabilities[index] = (
            get_positive_probability(
                pump_unsetting_model,
                row
            )
        )

    candidates[
        "rod_floating_risk"
    ] = rod_probabilities

    candidates[
        "impact_loading_risk"
    ] = impact_probabilities

    candidates[
        "pump_unsetting_risk"
    ] = pump_probabilities

    candidates[
        "combined_srp_risk"
    ] = (
        candidates["rod_floating_risk"]
        + candidates["impact_loading_risk"]
        + candidates["pump_unsetting_risk"]
    ) / 3

    # --------------------------------------------------------
    # Estimated SOR
    # --------------------------------------------------------

    candidates[
        "estimated_steam_oil_ratio"
    ] = (
        candidates["steam_volume"]
        / (
            candidates[
                "predicted_oil_production"
            ].clip(lower=0.1)
        )
    )

    # --------------------------------------------------------
    # Pump load indicator
    # --------------------------------------------------------

    candidates[
        "pump_load_indicator"
    ] = (
        candidates["stroke_length"]
        * candidates["spm"]
        * candidates["vfd_frequency"]
        / 10000
    )

    # --------------------------------------------------------
    # Normalize metrics
    # --------------------------------------------------------

    production_min = (
        candidates[
            "predicted_oil_production"
        ].min()
    )

    production_max = (
        candidates[
            "predicted_oil_production"
        ].max()
    )

    sor_min = (
        candidates[
            "estimated_steam_oil_ratio"
        ].min()
    )

    sor_max = (
        candidates[
            "estimated_steam_oil_ratio"
        ].max()
    )

    risk_min = (
        candidates[
            "combined_srp_risk"
        ].min()
    )

    risk_max = (
        candidates[
            "combined_srp_risk"
        ].max()
    )

    load_min = (
        candidates[
            "pump_load_indicator"
        ].min()
    )

    load_max = (
        candidates[
            "pump_load_indicator"
        ].max()
    )

    def normalize_positive(
        values,
        minimum,
        maximum
    ):

        if maximum == minimum:
            return np.ones(len(values))

        return (
            (values - minimum)
            / (maximum - minimum)
        )

    def normalize_negative(
        values,
        minimum,
        maximum
    ):

        if maximum == minimum:
            return np.ones(len(values))

        return (
            1
            - (
                (values - minimum)
                / (maximum - minimum)
            )
        )

    production_score = normalize_positive(
        candidates[
            "predicted_oil_production"
        ],
        production_min,
        production_max
    )

    sor_score = normalize_negative(
        candidates[
            "estimated_steam_oil_ratio"
        ],
        sor_min,
        sor_max
    )

    risk_score = normalize_negative(
        candidates[
            "combined_srp_risk"
        ],
        risk_min,
        risk_max
    )

    load_score = normalize_negative(
        candidates[
            "pump_load_indicator"
        ],
        load_min,
        load_max
    )

    # --------------------------------------------------------
    # Overall optimization score
    # --------------------------------------------------------

    candidates[
        "optimization_score"
    ] = (
        0.50 * production_score
        + 0.20 * sor_score
        + 0.20 * risk_score
        + 0.10 * load_score
    )

    candidates = candidates.sort_values(
        "optimization_score",
        ascending=False
    ).reset_index(drop=True)

    best = candidates.iloc[0]

    # --------------------------------------------------------
    # Production improvement
    # --------------------------------------------------------

    if current_production > 0:

        improvement = (
            (
                best[
                    "predicted_oil_production"
                ]
                - current_production
            )
            / current_production
        ) * 100

    else:

        improvement = 0.0

    # --------------------------------------------------------
    # Current configuration
    # --------------------------------------------------------

    current_configuration = {
        "steam_volume": float(
            latest["steam_volume"]
        ),

        "injection_pressure": float(
            latest["injection_pressure"]
        ),

        "soak_time": float(
            latest["soak_time"]
        ),

        "stroke_length": float(
            latest["stroke_length"]
        ),

        "spm": float(
            latest["spm"]
        ),

        "vfd_frequency": float(
            latest["vfd_frequency"]
        ),
    }

    # --------------------------------------------------------
    # Recommended configuration
    # --------------------------------------------------------

    recommended_configuration = {
        parameter: float(
            best[parameter]
        )
        for parameter in OPTIMIZATION_PARAMETERS
    }

    # --------------------------------------------------------
    # Top recommendations
    # --------------------------------------------------------

    top_results = []

    for _, result in candidates.head(10).iterrows():

        top_results.append(
            {
                parameter: float(
                    result[parameter]
                )
                for parameter in OPTIMIZATION_PARAMETERS
            }
            | {
                "predicted_oil_production": float(
                    result[
                        "predicted_oil_production"
                    ]
                ),

                "estimated_steam_oil_ratio": float(
                    result[
                        "estimated_steam_oil_ratio"
                    ]
                ),

                "rod_floating_risk": float(
                    result[
                        "rod_floating_risk"
                    ]
                ),

                "impact_loading_risk": float(
                    result[
                        "impact_loading_risk"
                    ]
                ),

                "pump_unsetting_risk": float(
                    result[
                        "pump_unsetting_risk"
                    ]
                ),

                "combined_srp_risk": float(
                    result[
                        "combined_srp_risk"
                    ]
                ),

                "optimization_score": float(
                    result[
                        "optimization_score"
                    ]
                ),
            }
        )

    # --------------------------------------------------------
    # Save results
    # --------------------------------------------------------

    os.makedirs(
        OUTPUT_DIR,
        exist_ok=True
    )

    output_path = os.path.join(
        OUTPUT_DIR,
        f"optimization_results_{well_id}.csv"
    )

    candidates.head(50).to_csv(
        output_path,
        index=False
    )

    # --------------------------------------------------------
    # Final response
    # --------------------------------------------------------

    return {
        "well_id": well_id,

        "data_status": {
            "dataset_type": "physics-informed synthetic demo data",
            "field_validation": False,
            "note": (
                "This prototype uses synthetic data. "
                "Recommendations are not field-approved "
                "operating instructions."
            ),
        },

        "current_condition": {
            "date": str(
                latest["date"].date()
            ),

            "reservoir_temperature": float(
                latest[
                    "reservoir_temperature"
                ]
            ),

            "reservoir_pressure": float(
                latest[
                    "reservoir_pressure"
                ]
            ),

            "oil_viscosity": float(
                latest["oil_viscosity"]
            ),

            "water_cut": float(
                latest["water_cut"]
            ),

            "fluid_level": float(
                latest["fluid_level"]
            ),
        },

        "current_configuration": current_configuration,

        "current_ai_prediction": {
            "predicted_next_day_oil_production": float(
                current_production
            ),

            "srp_risk": current_risk,
        },

        "recommended_configuration": (
            recommended_configuration
        ),

        "recommended_prediction": {
            "predicted_next_day_oil_production": float(
                best[
                    "predicted_oil_production"
                ]
            ),

            "estimated_steam_oil_ratio": float(
                best[
                    "estimated_steam_oil_ratio"
                ]
            ),

            "rod_floating_risk": float(
                best[
                    "rod_floating_risk"
                ]
            ),

            "impact_loading_risk": float(
                best[
                    "impact_loading_risk"
                ]
            ),

            "pump_unsetting_risk": float(
                best[
                    "pump_unsetting_risk"
                ]
            ),

            "combined_srp_risk": float(
                best[
                    "combined_srp_risk"
                ]
            ),

            "optimization_score": float(
                best[
                    "optimization_score"
                ]
            ),

            "estimated_production_improvement_percent": float(
                improvement
            ),
        },

        "optimization_metadata": {
            "candidate_count": int(
                num_candidates
            ),

            "search_bounds": bounds,

            "search_bounds_type": (
                "dataset_10th_to_90th_percentile"
            ),

            "objective_weights": {
                "production": 0.50,
                "steam_oil_ratio": 0.20,
                "mechanical_risk": 0.20,
                "pump_load": 0.10,
            },

            "results_file": output_path,
        },

        "top_10_recommendations": top_results,
    }


# ============================================================
# API ENDPOINTS
# ============================================================

@app.get("/")
def root():

    return {
        "service": "Baghewala Well-to-Surface AI API",
        "version": "1.0.0",
        "status": "running",
        "data_type": "physics-informed synthetic demo data",
        "field_validation": False,
        "docs": "/docs",
    }


# ------------------------------------------------------------
# HEALTH
# ------------------------------------------------------------

@app.get("/health")
def health():

    return {
        "status": "healthy",
        "service": "baghewala-ai-api",
        "models_loaded": True,
        "dataset_loaded": True,
    }


# ------------------------------------------------------------
# WELLS
# ------------------------------------------------------------

@app.get("/wells")
def get_wells():

    wells = sorted(
        df["well_id"].unique().tolist()
    )

    return {
        "count": len(wells),
        "wells": wells,
    }


# ------------------------------------------------------------
# WELL INFORMATION
# ------------------------------------------------------------

@app.post("/well")
def get_well(request: WellRequest):

    history = get_well_history(
        request.well_id
    )

    latest = history.iloc[-1]

    return {
        "well_id": request.well_id,

        "latest_date": str(
            latest["date"].date()
        ),

        "records": len(history),

        "current_condition": {
            "reservoir_temperature": float(
                latest[
                    "reservoir_temperature"
                ]
            ),

            "reservoir_pressure": float(
                latest[
                    "reservoir_pressure"
                ]
            ),

            "oil_viscosity": float(
                latest["oil_viscosity"]
            ),

            "water_cut": float(
                latest["water_cut"]
            ),

            "fluid_level": float(
                latest["fluid_level"]
            ),
        },
    }


# ============================================================
# AI PRODUCTION PREDICTION
# ============================================================

@app.post("/api/ai/predict/production")
def api_predict_production(
    request: PredictionRequest
):

    history = get_well_history(
        request.well_id
    )

    latest = history.iloc[-1]

    prediction = predict_current_production(
        request.well_id
    )

    return {
        "well_id": request.well_id,

        "prediction": {
            "target": "oil_production_next_day",

            "predicted_value": prediction,

            "unit": "synthetic production units/day",
        },

        "current_condition": {
            "date": str(
                latest["date"].date()
            ),

            "reservoir_temperature": float(
                latest[
                    "reservoir_temperature"
                ]
            ),

            "reservoir_pressure": float(
                latest[
                    "reservoir_pressure"
                ]
            ),

            "oil_viscosity": float(
                latest["oil_viscosity"]
            ),

            "water_cut": float(
                latest["water_cut"]
            ),
        },

        "data_status": {
            "dataset_type": (
                "physics-informed synthetic demo data"
            ),

            "field_validation": False,
        },
    }


# ------------------------------------------------------------
# BACKWARD-COMPATIBLE PRODUCTION ENDPOINT
# ------------------------------------------------------------

@app.post("/predict/production")
def predict_production_legacy(
    request: PredictionRequest
):

    return api_predict_production(
        request
    )


# ============================================================
# AI SRP RISK PREDICTION
# ============================================================

@app.post("/api/ai/predict/risk")
def api_predict_risk(
    request: PredictionRequest
):

    risk = predict_current_risk(
        request.well_id
    )

    return {
        "well_id": request.well_id,

        "risk_prediction": risk,

        "data_status": {
            "dataset_type": (
                "physics-informed synthetic demo data"
            ),

            "field_validation": False,

            "label_definition": (
                "High-risk class represents "
                "the upper 25 percent of synthetic "
                "risk scores used during prototype training."
            ),
        },
    }


# ------------------------------------------------------------
# BACKWARD-COMPATIBLE RISK ENDPOINT
# ------------------------------------------------------------

@app.post("/predict/risk")
def predict_risk_legacy(
    request: PredictionRequest
):

    return api_predict_risk(
        request
    )


# ============================================================
# AI OPTIMIZATION
# ============================================================

@app.post("/api/ai/optimize")
def api_optimize(
    request: OptimizationRequest
):

    return optimize_well(
        well_id=request.well_id,
        num_candidates=request.num_candidates,
        constraints=request.constraints,
    )


# ------------------------------------------------------------
# BACKWARD-COMPATIBLE OPTIMIZATION ENDPOINT
# ------------------------------------------------------------

@app.post("/optimize")
def optimize_legacy(
    request: OptimizationRequest
):

    return api_optimize(
        request
    )


# ============================================================
# RUN
# ============================================================

if __name__ == "__main__":

    import uvicorn

    uvicorn.run(
        "src.api:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
    )