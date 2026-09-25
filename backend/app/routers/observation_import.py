from fastapi import APIRouter, HTTPException
from fastapi.responses import PlainTextResponse

from app.config import get_settings
from app.schemas.models import ObservationImportCommitResponse, ObservationImportPreview, ObservationImportRequest
from app.services import observation_import, supabase_client

router = APIRouter(prefix="/api/import/observations", tags=["observation-import"])


@router.get("/template.csv", response_class=PlainTextResponse)
def template_csv() -> PlainTextResponse:
    return PlainTextResponse(
        observation_import.template_csv(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=well_observations_template.csv"},
    )


@router.get("/synthetic-sample.csv", response_class=PlainTextResponse)
def synthetic_sample_csv() -> PlainTextResponse:
    return PlainTextResponse(
        observation_import.synthetic_sample_csv(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=well_observations_synthetic_sample.csv"},
    )


@router.get("/rules")
def rules() -> dict:
    settings = get_settings()
    return {
        **observation_import.validation_notes(),
        "writes_enabled": getattr(settings, "csv_import_writes_enabled", False),
        "write_protection_message": "Production import confirmation is unavailable here. Use dry-run preview only, or enable writes on a trusted non-production local/dev backend.",
    }


@router.post("/dry-run", response_model=ObservationImportPreview)
def dry_run(request: ObservationImportRequest) -> dict:
    wells = supabase_client.list_wells()
    existing = supabase_client.list_observation_keys([well["id"] for well in wells])
    return _preview(request, wells, existing)


@router.post("/confirm", response_model=ObservationImportCommitResponse)
def confirm_import(request: ObservationImportRequest) -> dict:
    settings = get_settings()
    if not getattr(settings, "csv_import_writes_enabled", False):
        raise HTTPException(
            status_code=403,
            detail={
                "code": "IMPORT_DISABLED",
                "message": "CSV observation import writes are disabled. Set ALLOW_LOCAL_CSV_IMPORT=true only in a trusted non-production local/dev backend.",
            },
        )
    wells = supabase_client.list_wells()
    existing = supabase_client.list_observation_keys([well["id"] for well in wells])
    preview = _preview(request, wells, existing)
    if preview["errors"]:
        raise HTTPException(status_code=422, detail={
            "code": "IMPORT_VALIDATION_FAILED",
            "message": "Resolve validation errors before importing.",
            "errors": preview["errors"],
        })
    rows, upload_id, uploaded_at = observation_import.rows_for_insert(preview)
    imported = supabase_client.insert_observations(rows)
    return {
        **preview,
        "imported_rows": imported,
        "skipped_rows": preview["duplicate_rows"],
        "rejected_rows": preview["error_count"],
        "upload_id": upload_id,
        "uploaded_at": uploaded_at,
        "persistence_status": "saved_to_supabase:well_observations" if imported else "no_new_rows_to_import",
    }


def _preview(request: ObservationImportRequest, wells: list[dict], existing: set[tuple[str, str]]) -> dict:
    return observation_import.parse_and_validate_csv(
        request.csv_text,
        wells,
        existing,
        dataset_id=request.dataset_id,
        source=request.source,
        data_kind=request.data_kind,
    )
