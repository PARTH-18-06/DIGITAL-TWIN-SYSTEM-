from fastapi import APIRouter, HTTPException

from app.schemas.models import Well
from app.services import supabase_client

router = APIRouter(prefix="/api/wells", tags=["wells"])


@router.get("", response_model=list[Well])
def wells() -> list[dict]:
    return supabase_client.list_wells()


@router.get("/{well_id}", response_model=Well)
def well(well_id: str) -> dict:
    result = supabase_client.get_well(well_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Well '{well_id}' was not found.")
    return result
