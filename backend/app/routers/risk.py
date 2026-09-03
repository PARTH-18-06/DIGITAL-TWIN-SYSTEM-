from fastapi import APIRouter, HTTPException

from app.ml.forecasting.predictor import load_local_csv_observations
from app.ml.optimizer import ModelArtifactsMissing, predict_outputs
from app.ml.risk.classifier import RiskArtifactsMissing, classify_risks
from app.schemas.models import RiskRequest, RiskResponse
from app.services import supabase_client


router = APIRouter(prefix="/api/risk", tags=["risk"])

LIVE_RISK_FIELDS = (
    "temperature",
    "pressure",
    "viscosity",
    "rpm_or_spm",
    "steam_injection_pressure",
    "steam_volume",
    "soak_time",
    "production_cutoff",
    "stroke_length",
    "vfd_frequency",
    "fluid_level",
    "water_cut",
)


@router.post("", response_model=RiskResponse)
def assess_risk(request: RiskRequest) -> dict:
    well = supabase_client.require_well_identifier(request.well_id)
    well_name = well["well_name"]
    try:
        latest = _latest_observation(well["id"], well_name)
        if _has_live_state(request):
            state = _request_to_current_state(request, well, latest)
        elif latest:
            state = _latest_to_current_state(latest)
        else:
            raise HTTPException(status_code=422, detail="No observation history exists for this well.")
        continuous = predict_outputs(state)
        output = classify_risks(state, continuous)
        return {"well_id": well["id"], **output}
    except (ModelArtifactsMissing, RiskArtifactsMissing) as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


def _latest_to_current_state(row: dict) -> dict:
    return {
        "well_id": row["well_id"],
        "temperature": row["reservoir_temperature"],
        "pressure": row["reservoir_pressure"],
        "viscosity": row["oil_viscosity"],
        "oil_api": row["oil_api"],
        "days_since_steam": row["days_since_steam"],
        "rpm_or_spm": row["spm"],
        "steam_injection_pressure": row["injection_pressure"],
        "steam_volume": row["steam_volume"],
        "soak_time": row["soak_time"],
        "production_cutoff": row["production_cutoff"],
        "stroke_length": row["stroke_length"],
        "vfd_frequency": row["vfd_frequency"],
        "fluid_level": row["fluid_level"],
        "water_cut": row["water_cut"],
    }


def _latest_observation(well_id: str, well_name: str) -> dict | None:
    try:
        observations = supabase_client.list_observations_for_well(well_id)
    except HTTPException:
        observations = []
    if not observations:
        observations = load_local_csv_observations(well_name)
    return observations[-1] if observations else None


def _has_live_state(request: RiskRequest) -> bool:
    data = request.model_dump(exclude_none=True)
    return any(field in data for field in LIVE_RISK_FIELDS)


def _request_to_current_state(request: RiskRequest, well: dict, latest: dict | None) -> dict:
    data = request.model_dump(exclude_none=True)
    missing = [field for field in LIVE_RISK_FIELDS if field not in data]
    if missing:
        raise HTTPException(
            status_code=422,
            detail="Missing required live risk input field(s): " + ", ".join(missing),
        )

    data["well_id"] = well["id"]
    data["oil_api"] = _resolve_oil_api(data, well, latest)
    data["days_since_steam"] = data.get("days_since_steam", (latest or {}).get("days_since_steam", 0))
    return data


def _resolve_oil_api(data: dict, well: dict, latest: dict | None) -> float:
    oil_api = data.get("oil_api")
    if oil_api is None:
        oil_api = (well.get("oil_properties") or {}).get("oil_api")
    if oil_api is None and latest:
        oil_api = latest.get("oil_api")
    if oil_api is None:
        raise HTTPException(status_code=422, detail="Selected well is missing oil_api for live risk assessment.")
    return oil_api
