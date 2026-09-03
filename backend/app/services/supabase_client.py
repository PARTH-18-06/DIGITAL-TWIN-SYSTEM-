from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from postgrest.exceptions import APIError

from app.config import get_supabase_client


def _client():
    client = get_supabase_client()
    if client is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                            detail="Supabase is not configured. Set SUPABASE_URL and SUPABASE_KEY.")
    return client


def list_wells() -> list[dict[str, Any]]:
    try:
        return _client().table("wells").select("*").order("well_name").execute().data or []
    except APIError as exc:
        raise HTTPException(status_code=502, detail=f"Supabase query failed: {exc.message}") from exc


def get_well(well_id: str) -> dict[str, Any] | None:
    try:
        UUID(well_id)
    except ValueError:
        return None
    try:
        rows = _client().table("wells").select("*").eq("id", well_id).limit(1).execute().data or []
        return rows[0] if rows else None
    except APIError as exc:
        raise HTTPException(status_code=502, detail=f"Supabase query failed: {exc.message}") from exc


def get_well_by_name(well_name: str) -> dict[str, Any] | None:
    try:
        rows = _client().table("wells").select("*").eq("well_name", well_name).limit(1).execute().data or []
        return rows[0] if rows else None
    except APIError as exc:
        raise HTTPException(status_code=502, detail=f"Supabase query failed: {exc.message}") from exc


def require_well(well_id: str) -> dict[str, Any]:
    well = get_well(well_id)
    if well is None:
        raise HTTPException(status_code=404, detail=f"Well '{well_id}' was not found.")
    return well


def require_well_identifier(identifier: str) -> dict[str, Any]:
    well = get_well(identifier) or get_well_by_name(identifier)
    if well is None:
        raise HTTPException(status_code=404, detail=f"Well '{identifier}' was not found.")
    return well


def save_simulation(input_parameters: dict[str, Any], output: dict[str, Any]) -> None:
    try:
        _client().table("simulation_runs").insert({"well_id": input_parameters["well_id"],
            "input_parameters": input_parameters, "simulation_output": output}).execute()
    except APIError as exc:
        raise HTTPException(status_code=502, detail=f"Could not persist simulation: {exc.message}") from exc


def save_optimization(
    well_id: str,
    current_parameters: dict[str, Any],
    recommended_parameters: dict[str, float],
    predicted_results: dict[str, Any],
) -> None:
    try:
        _client().table("optimization_runs").insert({
            "well_id": well_id,
            "current_parameters": current_parameters,
            "recommended_parameters": recommended_parameters,
            "predicted_results": predicted_results,
        }).execute()
    except APIError as exc:
        raise HTTPException(status_code=502, detail=f"Could not persist optimization: {exc.message}") from exc


def list_observations_for_well(well_id: str, limit: int = 64) -> list[dict[str, Any]]:
    try:
        rows = (_client().table("well_observations").select("*").eq("well_id", well_id)
                .order("observed_at", desc=True).limit(limit).execute().data or [])
        rows.reverse()
        return [_observation_to_dataset_shape(row) for row in rows]
    except APIError as exc:
        raise HTTPException(status_code=502, detail=f"Supabase observations query failed: {exc.message}") from exc


def save_forecast(
    well_id: str,
    forecast_date: str,
    input_snapshot: dict[str, Any],
    predicted_oil_production: float,
    risk_output: dict[str, Any] | None,
    model_metadata: dict[str, Any],
) -> None:
    try:
        _client().table("forecast_runs").insert({
            "well_id": well_id,
            "forecast_date": forecast_date,
            "input_snapshot": input_snapshot,
            "predicted_oil_production": predicted_oil_production,
            "risk_output": risk_output or {},
            "model_metadata": model_metadata,
        }).execute()
    except APIError as exc:
        raise HTTPException(status_code=502, detail=f"Could not persist forecast: {exc.message}") from exc


def get_history(well_id: str) -> dict[str, list[dict[str, Any]]]:
    require_well(well_id)
    try:
        simulations = (_client().table("simulation_runs").select("*").eq("well_id", well_id)
                       .order("created_at", desc=True).execute().data or [])
        optimizations = (_client().table("optimization_runs").select("*").eq("well_id", well_id)
                         .order("created_at", desc=True).execute().data or [])
        try:
            forecasts = (_client().table("forecast_runs").select("*").eq("well_id", well_id)
                         .order("created_at", desc=True).execute().data or [])
        except APIError:
            forecasts = []
        return {"simulation_runs": simulations, "optimization_runs": optimizations, "forecast_runs": forecasts}
    except APIError as exc:
        raise HTTPException(status_code=502, detail=f"Supabase query failed: {exc.message}") from exc


def _observation_to_dataset_shape(row: dict[str, Any]) -> dict[str, Any]:
    shaped = dict(row)
    shaped["date"] = shaped.pop("observed_at")
    return shaped
