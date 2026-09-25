from fastapi import APIRouter

from app.schemas.models import HistoryResponse, ObservationsResponse
from app.services import supabase_client

router = APIRouter(prefix="/api/history", tags=["history"])


@router.get("/{well_id}", response_model=HistoryResponse)
def history(well_id: str) -> dict:
    well = supabase_client.require_well_identifier(well_id)
    resolved_well_id = well["id"]
    records = supabase_client.get_history(resolved_well_id)
    return {"well_id": resolved_well_id, **records}


@router.get("/{well_id}/observations", response_model=ObservationsResponse)
def observations(well_id: str, limit: int = 180) -> dict:
    well = supabase_client.require_well_identifier(well_id)
    resolved_well_id = well["id"]
    bounded_limit = max(1, min(limit, 1000))
    rows = supabase_client.list_observations_for_well(resolved_well_id, limit=bounded_limit)
    return {"well_id": resolved_well_id, "observations": rows}
