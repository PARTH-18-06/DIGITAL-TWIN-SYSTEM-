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
        except HTTPException as exc:
            raise exc
        if not observations:
            try:
                observations = load_local_csv_observations(well_name)
            except FileNotFoundError as exc:
                raise _insufficient_history(well_name) from exc
            history_source = "local_csv_development_fallback"
        if not observations:
            raise _insufficient_history(well_name)
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
        raise _insufficient_history(well_name, str(exc)) from exc


def _insufficient_history(well_name: str, reason: str | None = None) -> HTTPException:
    return HTTPException(
        status_code=422,
        detail={
            "code": "INSUFFICIENT_HISTORY",
            "message": f"Insufficient observation history for {well_name}. Run or import well_observations before forecasting.",
            "reason": reason or "No Supabase observations were found and the local development CSV fallback is unavailable or empty.",
        },
    )
