from fastapi import APIRouter

from app.schemas.models import SimulationInput, SimulationResponse
from app.services import supabase_client
from app.simulation.physics import run_stage1_simulation

router = APIRouter(prefix="/api/simulation", tags=["simulation"])


@router.post("", response_model=SimulationResponse)
def simulate(parameters: SimulationInput) -> dict:
    well = supabase_client.require_well_identifier(parameters.well_id)
    input_dict = parameters.model_dump()
    input_dict["well_id"] = well["id"]
    output = run_stage1_simulation(input_dict)
    supabase_client.save_simulation(input_dict, output)
    return output
