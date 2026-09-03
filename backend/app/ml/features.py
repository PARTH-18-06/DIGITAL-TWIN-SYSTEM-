"""Shared Stage 2 feature and target definitions."""

FEATURE_COLUMNS = [
    "steam_volume",
    "injection_pressure",
    "soak_time",
    "production_cutoff",
    "reservoir_temperature",
    "reservoir_pressure",
    "oil_viscosity",
    "oil_api",
    "stroke_length",
    "spm",
    "vfd_frequency",
    "fluid_level",
    "water_cut",
]

TARGET_COLUMNS = [
    "oil_production",
    "steam_oil_ratio",
    "energy_per_barrel",
    "rod_floating_risk",
    "impact_loading_risk",
    "pump_unsetting_risk",
    "rod_failure_risk",
]

CONTROLLABLE_FEATURES = [
    "steam_volume",
    "injection_pressure",
    "soak_time",
    "production_cutoff",
    "stroke_length",
    "spm",
    "vfd_frequency",
]

FEATURE_TO_API_FIELD = {
    "steam_volume": "steam_volume",
    "injection_pressure": "steam_injection_pressure",
    "soak_time": "soak_time",
    "production_cutoff": "production_cutoff",
    "reservoir_temperature": "temperature",
    "reservoir_pressure": "pressure",
    "oil_viscosity": "viscosity",
    "stroke_length": "stroke_length",
    "spm": "rpm_or_spm",
    "vfd_frequency": "vfd_frequency",
    "fluid_level": "fluid_level",
    "water_cut": "water_cut",
}

API_FIELD_TO_FEATURE = {value: key for key, value in FEATURE_TO_API_FIELD.items()}
