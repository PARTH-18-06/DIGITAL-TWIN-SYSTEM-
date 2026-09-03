from fastapi import APIRouter, HTTPException

from app.ml.forecasting.features import InsufficientHistory
from app.ml.forecasting.predictor import (
    ForecastArtifactsMissing,
    load_local_csv_observations,
    predict_next_day,
)
from app.schemas.models import ForecastRequest, ForecastResponse
from app.services import supabase_client


router = APIRouter(prefix="/api/forecast", tags=["forecast"])


@router.post("/next-day", response_model=ForecastResponse)
def next_day_forecast(request: ForecastRequest) -> dict:
    well = supabase_client.require_well_identifier(request.well_id)
    well_name = well["well_name"]
    try:
        try:
            observations = supabase_client.list_observations_for_well(well["id"])
            history_source = "supabase:well_observations"
        except HTTPException:
            observations = []
            history_source = "local_csv_development_fallback"
        if not observations:
            observations = load_local_csv_observations(well_name)
            history_source = "local_csv_development_fallback"
        output = predict_next_day(well_name, observations, history_source)
        output["well_id"] = well["id"]
        try:
            supabase_client.save_forecast(
                well_id=well["id"],
                forecast_date=output["forecast_date"],
                input_snapshot=output["input_snapshot"],
                predicted_oil_production=output["predicted_oil_production"],
                risk_output=None,
                model_metadata={
                    "model_version": output["model_version"],
                    "validation_summary": output["validation_summary"],
                    "history_source": history_source,
                },
            )
            output["persistence_status"] = "saved_to_supabase:forecast_runs"
        except HTTPException as exc:
            output["persistence_status"] = f"blocked: {exc.detail}"
        return output
    except ForecastArtifactsMissing as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except InsufficientHistory as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
