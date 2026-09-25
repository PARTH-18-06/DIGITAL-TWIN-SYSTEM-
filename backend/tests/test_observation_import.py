from types import SimpleNamespace

from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import app


WELL = {"id": "00000000-0000-0000-0000-000000000001", "well_name": "BGH-001"}
HEADER = (
    "well_identifier,observed_at,oil_production,reservoir_temperature,reservoir_pressure,"
    "steam_volume,injection_pressure,soak_time,production_cutoff,oil_viscosity,oil_api,"
    "days_since_steam,water_cut,fluid_level,stroke_length,spm,vfd_frequency,cycle_number"
)
VALID_ROW = "BGH-001,2026-01-01T00:00:00Z,18.5,82,4.2,900,20,24,10,1000,18.5,3,0.15,40,55,8,40,1"


def payload(csv_text: str) -> dict:
    return {
        "csv_text": csv_text,
        "dataset_id": "qa-field-upload",
        "source": "pytest",
        "data_kind": "field_measurement",
    }


def patch_storage(monkeypatch, *, existing=None, insert=None, enabled=False):
    monkeypatch.setattr("app.routers.observation_import.supabase_client.list_wells", lambda: [WELL])
    monkeypatch.setattr("app.routers.observation_import.supabase_client.list_observation_keys",
                        lambda well_ids: existing or set())
    if insert is None:
        insert = lambda rows: len(rows)
    monkeypatch.setattr("app.routers.observation_import.supabase_client.insert_observations", insert)
    monkeypatch.setattr("app.routers.observation_import.get_settings",
                        lambda: SimpleNamespace(
                            allow_local_csv_import=enabled,
                            csv_import_writes_enabled=enabled,
                        ))


def test_template_documents_required_columns():
    response = TestClient(app).get("/api/import/observations/template.csv")

    assert response.status_code == 200
    assert "well_identifier,observed_at,oil_production" in response.text
    assert response.headers["content-type"].startswith("text/csv")


def test_valid_dry_run_makes_no_writes(monkeypatch):
    inserted = []
    patch_storage(monkeypatch, insert=lambda rows: inserted.extend(rows))

    response = TestClient(app).post("/api/import/observations/dry-run", json=payload(f"{HEADER}\n{VALID_ROW}\n"))

    assert response.status_code == 200
    body = response.json()
    assert body["error_count"] == 0
    assert body["importable_rows"] == 1
    assert body["field_validated"] is False
    assert inserted == []


def test_confirm_import_requires_local_flag(monkeypatch):
    patch_storage(monkeypatch, enabled=False)

    response = TestClient(app).post("/api/import/observations/confirm", json=payload(f"{HEADER}\n{VALID_ROW}\n"))

    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "IMPORT_DISABLED"


def test_rules_report_write_protection_state(monkeypatch):
    monkeypatch.setattr(
        "app.routers.observation_import.get_settings",
        lambda: SimpleNamespace(csv_import_writes_enabled=False),
    )

    response = TestClient(app).get("/api/import/observations/rules")

    assert response.status_code == 200
    assert response.json()["writes_enabled"] is False
    assert "unavailable" in response.json()["write_protection_message"].lower()


def test_confirm_import_blocks_production_like_environment(monkeypatch):
    patch_storage(monkeypatch)
    monkeypatch.setattr(
        "app.routers.observation_import.get_settings",
        lambda: SimpleNamespace(
            allow_local_csv_import=True,
            csv_import_writes_enabled=False,
        ),
    )

    response = TestClient(app).post("/api/import/observations/confirm", json=payload(f"{HEADER}\n{VALID_ROW}\n"))

    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "IMPORT_DISABLED"


def test_settings_allow_import_writes_only_in_non_production(monkeypatch):
    monkeypatch.delenv("RENDER", raising=False)
    monkeypatch.delenv("VERCEL", raising=False)

    assert Settings(allow_local_csv_import=True, environment="development").csv_import_writes_enabled is True
    assert Settings(allow_local_csv_import=True, environment="production").csv_import_writes_enabled is False

    monkeypatch.setenv("VERCEL", "1")
    assert Settings(allow_local_csv_import=True, environment="development").csv_import_writes_enabled is False


def test_confirm_import_persists_provenance_when_enabled(monkeypatch):
    inserted = []
    patch_storage(monkeypatch, enabled=True, insert=lambda rows: inserted.extend(rows) or len(rows))

    response = TestClient(app).post("/api/import/observations/confirm", json=payload(f"{HEADER}\n{VALID_ROW}\n"))

    assert response.status_code == 200
    assert response.json()["imported_rows"] == 1
    assert inserted[0]["dataset_identifier"] == "qa-field-upload"
    assert inserted[0]["data_kind"] == "field_measurement"
    assert inserted[0]["field_validated"] is False
    assert inserted[0]["observation_source"] == "pytest"


def test_missing_headers_return_row_zero_errors(monkeypatch):
    patch_storage(monkeypatch)

    response = TestClient(app).post("/api/import/observations/dry-run", json=payload("well_identifier,observed_at\nBGH-001,2026-01-01\n"))

    assert response.status_code == 200
    assert response.json()["error_count"] > 0
    assert any(issue["row"] == 0 and issue["field"] == "oil_production" for issue in response.json()["errors"])


def test_invalid_number_missing_value_unknown_well_and_timestamp(monkeypatch):
    patch_storage(monkeypatch)
    bad_row = "NOPE,not-a-date,abc,,4.2,900,20,24,10,1000,18.5,3,0.15,40,55,8,40,1"

    response = TestClient(app).post("/api/import/observations/dry-run", json=payload(f"{HEADER}\n{bad_row}\n"))

    assert response.status_code == 200
    fields = {issue["field"] for issue in response.json()["errors"]}
    assert {"well_identifier", "observed_at", "oil_production", "reservoir_temperature"}.issubset(fields)
    assert response.json()["importable_rows"] == 0


def test_duplicate_rows_within_file_are_errors(monkeypatch):
    patch_storage(monkeypatch)

    response = TestClient(app).post("/api/import/observations/dry-run", json=payload(f"{HEADER}\n{VALID_ROW}\n{VALID_ROW}\n"))

    assert response.status_code == 200
    assert any("Duplicate" in issue["message"] for issue in response.json()["errors"])


def test_repeated_upload_skips_existing_rows(monkeypatch):
    patch_storage(monkeypatch, existing={(WELL["id"], "2026-01-01")}, enabled=True)

    dry_run = TestClient(app).post("/api/import/observations/dry-run", json=payload(f"{HEADER}\n{VALID_ROW}\n"))
    confirm = TestClient(app).post("/api/import/observations/confirm", json=payload(f"{HEADER}\n{VALID_ROW}\n"))

    assert dry_run.status_code == 200
    assert dry_run.json()["duplicate_rows"] == 1
    assert dry_run.json()["importable_rows"] == 0
    assert confirm.status_code == 200
    assert confirm.json()["imported_rows"] == 0
    assert confirm.json()["skipped_rows"] == 1


def test_repeated_confirm_uses_isolated_storage_without_duplicates(monkeypatch):
    keys = set()
    inserted = []

    def list_keys(well_ids):
        return set(keys)

    def insert_rows(rows):
        for row in rows:
            key = (row["well_id"], row["observed_at"])
            if key not in keys:
                keys.add(key)
                inserted.append(row)
        return len(rows)

    monkeypatch.setattr("app.routers.observation_import.supabase_client.list_wells", lambda: [WELL])
    monkeypatch.setattr("app.routers.observation_import.supabase_client.list_observation_keys", list_keys)
    monkeypatch.setattr("app.routers.observation_import.supabase_client.insert_observations", insert_rows)
    monkeypatch.setattr(
        "app.routers.observation_import.get_settings",
        lambda: SimpleNamespace(allow_local_csv_import=True, csv_import_writes_enabled=True),
    )

    first = TestClient(app).post("/api/import/observations/confirm", json=payload(f"{HEADER}\n{VALID_ROW}\n"))
    second = TestClient(app).post("/api/import/observations/confirm", json=payload(f"{HEADER}\n{VALID_ROW}\n"))

    assert first.status_code == 200
    assert first.json()["imported_rows"] == 1
    assert second.status_code == 200
    assert second.json()["imported_rows"] == 0
    assert second.json()["skipped_rows"] == 1
    assert len(inserted) == 1
    assert inserted[0]["data_kind"] == "field_measurement"
    assert inserted[0]["field_validated"] is False


def test_storage_failure_is_reported(monkeypatch):
    def fail_insert(rows):
        raise HTTPException(status_code=502, detail="storage unavailable")

    patch_storage(monkeypatch, enabled=True, insert=fail_insert)

    response = TestClient(app).post("/api/import/observations/confirm", json=payload(f"{HEADER}\n{VALID_ROW}\n"))

    assert response.status_code == 502
    assert "storage unavailable" in response.json()["detail"]


def test_oversized_files_are_rejected(monkeypatch):
    patch_storage(monkeypatch)

    response = TestClient(app).post("/api/import/observations/dry-run", json=payload("x" * 2_000_001))

    assert response.status_code == 413
