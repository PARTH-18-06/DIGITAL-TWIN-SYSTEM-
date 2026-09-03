from fastapi import APIRouter, HTTPException

from app.ml.forecasting.predictor import load_local_csv_observations
from app.ml.optimizer import ModelArtifactsMissing, predict_outputs
from app.ml.risk.classifier import RiskArtifactsMissing, classify_risks
from app.schemas.models import RiskRequest, RiskResponse
from app.services import supabase_client


router = APIRouter(prefix="/api/risk", tags=["risk"])


@router.post("", response_model=RiskResponse)
def assess_risk(request: RiskRequest) -> dict:
    well = supabase_client.require_well_identifier(request.well_id)
    well_name = well["well_name"]
    try:
        try:
            observations = supabase_client.list_observations_for_well(well["id"])
        except HTTPException:
            observations = []
        if not observations:
            observations = load_local_csv_observations(well_name)
        if not observations:
            raise HTTPException(status_code=422, detail="No observation history exists for this well.")
        latest = observations[-1]
        state = _latest_to_current_state(latest)
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
