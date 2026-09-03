from fastapi import APIRouter

from app.schemas.models import HistoryResponse
from app.services import supabase_client

router = APIRouter(prefix="/api/history", tags=["history"])


@router.get("/{well_id}", response_model=HistoryResponse)
def history(well_id: str) -> dict:
    well = supabase_client.require_well_identifier(well_id)
    resolved_well_id = well["id"]
    records = supabase_client.get_history(resolved_well_id)
    return {"well_id": resolved_well_id, **records}
