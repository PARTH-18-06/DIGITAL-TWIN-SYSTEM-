from fastapi import APIRouter, HTTPException

from app.schemas.models import OptimizationResponse, SimulationInput
from app.services import supabase_client
from app.ml.optimizer import ModelArtifactsMissing, recommend_parameters

router = APIRouter(prefix="/api/optimization", tags=["optimization"])


@router.post("", response_model=OptimizationResponse)
def optimize(parameters: SimulationInput) -> dict:
    well = supabase_client.require_well_identifier(parameters.well_id)
    current_state = parameters.model_dump()
    current_state["well_id"] = well["id"]
    oil_api = (well.get("oil_properties") or {}).get("oil_api")
    if oil_api is None:
        raise HTTPException(status_code=422, detail="Selected well is missing oil_properties.oil_api.")
    current_state["oil_api"] = oil_api

    try:
        output = recommend_parameters(well["id"], current_state)
    except ModelArtifactsMissing as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    supabase_client.save_optimization(
        well_id=well["id"],
        current_parameters=current_state,
        recommended_parameters=output["recommendedParameters"],
        predicted_results=output["predictions"],
    )
    return output
