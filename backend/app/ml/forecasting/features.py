"""Leakage-safe next-day forecasting feature preparation."""

from __future__ import annotations

import pandas as pd


MODEL_VERSION = "next-day-xgboost-v1"
TARGET_COLUMN = "oil_production_next_day"
MIN_HISTORY_ROWS = 8
HISTORY_WINDOW_DAYS = 7

BASE_FEATURE_COLUMNS = [
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

HISTORICAL_COLUMNS = [
    "reservoir_temperature",
    "reservoir_pressure",
    "oil_viscosity",
    "water_cut",
]

FORECAST_FEATURE_COLUMNS = [
    *BASE_FEATURE_COLUMNS,
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


class InsufficientHistory(ValueError):
    """Raised when a well does not have enough prior rows for lag features."""


def add_next_day_target(df: pd.DataFrame) -> pd.DataFrame:
    prepared = _sort(df)
    prepared[TARGET_COLUMN] = prepared.groupby("well_id")["oil_production"].shift(-1)
    return prepared


def add_temporal_features(df: pd.DataFrame) -> pd.DataFrame:
    prepared = _sort(df)
    for column in HISTORICAL_COLUMNS:
        grouped = prepared.groupby("well_id")[column]
        prepared[f"{column}_lag1"] = grouped.shift(1)
        prepared[f"{column}_lag7"] = grouped.shift(7)
        prepared[f"{column}_roll7_mean"] = grouped.transform(lambda values: values.shift(1).rolling(7).mean())
    return prepared


def add_engineered_features(df: pd.DataFrame) -> pd.DataFrame:
    prepared = df.copy()
    prepared["temp_viscosity_ratio"] = prepared["reservoir_temperature"] / (prepared["oil_viscosity"] + 1e-6)
    prepared["pressure_temperature_index"] = prepared["reservoir_pressure"] * prepared["reservoir_temperature"]
    prepared["pump_speed_index"] = prepared["stroke_length"] * prepared["spm"]
    prepared["vfd_load_index"] = prepared["vfd_frequency"] * prepared["spm"]
    prepared["thermal_decay_proxy"] = prepared["days_since_steam"] / (prepared["reservoir_temperature"] + 1e-6)
    prepared["viscosity_pressure_index"] = prepared["oil_viscosity"] / (prepared["reservoir_pressure"] + 1e-6)
    prepared["thermal_mobility_proxy"] = prepared["reservoir_temperature"] / (prepared["oil_viscosity"] + 1e-6)
    return prepared


def prepare_forecast_training_frame(df: pd.DataFrame) -> pd.DataFrame:
    prepared = add_next_day_target(df)
    prepared = add_temporal_features(prepared)
    prepared = add_engineered_features(prepared)
    return prepared.dropna(subset=[*FORECAST_FEATURE_COLUMNS, TARGET_COLUMN]).reset_index(drop=True)


def latest_feature_row(observations: list[dict]) -> tuple[pd.DataFrame, pd.Series]:
    if len(observations) < MIN_HISTORY_ROWS:
        raise InsufficientHistory(
            f"Next-day forecast needs the current observation plus {HISTORY_WINDOW_DAYS} prior observations."
        )
    df = pd.DataFrame(observations)
    prepared = add_temporal_features(df)
    prepared = add_engineered_features(prepared)
    complete = prepared.dropna(subset=FORECAST_FEATURE_COLUMNS).reset_index(drop=True)
    if complete.empty:
        raise InsufficientHistory("Observation history is present but incomplete for forecast features.")
    latest = complete.iloc[-1]
    features = pd.DataFrame([latest[FORECAST_FEATURE_COLUMNS]], columns=FORECAST_FEATURE_COLUMNS)
    return features, latest


def _sort(df: pd.DataFrame) -> pd.DataFrame:
    prepared = df.copy()
    prepared["date"] = pd.to_datetime(prepared["date"])
    return prepared.sort_values(["well_id", "date"]).reset_index(drop=True)
