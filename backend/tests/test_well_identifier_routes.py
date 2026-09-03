from fastapi import HTTPException
from fastapi.testclient import TestClient
import pytest

from app.main import app


WELL_UUID = "00000000-0000-0000-0000-000000000001"
WELL_NAME = "BGH-001"

VALID_SIMULATION_INPUT = {
    "well_id": WELL_NAME,
    "temperature": 80,
    "pressure": 4.2,
    "viscosity": 1000,
    "rpm_or_spm": 8,
    "steam_injection_pressure": 20,
    "steam_volume": 900,
    "soak_time": 24,
    "production_cutoff": 10,
    "stroke_length": 55,
    "vfd_frequency": 40,
    "fluid_level": 40,
    "water_cut": 0.15,
}


def resolve_known_well(identifier: str) -> dict:
    if identifier in {WELL_UUID, WELL_NAME}:
        return {"id": WELL_UUID, "well_name": WELL_NAME, "oil_properties": {"oil_api": 18.5}}
    raise HTTPException(status_code=404, detail=f"Well '{identifier}' was not found.")


def test_history_accepts_well_name_and_uuid_with_same_data(monkeypatch):
    calls: list[str] = []
    records = {
        "simulation_runs": [{"id": "sim-1", "well_id": WELL_UUID}],
        "optimization_runs": [{"id": "opt-1", "well_id": WELL_UUID}],
        "forecast_runs": [{"id": "forecast-1", "well_id": WELL_UUID}],
    }

    monkeypatch.setattr("app.routers.history.supabase_client.require_well_identifier", resolve_known_well)

    def fake_history(well_id: str) -> dict:
        calls.append(well_id)
        return records

    monkeypatch.setattr("app.routers.history.supabase_client.get_history", fake_history)
    client = TestClient(app)

    by_name = client.get(f"/api/history/{WELL_NAME}")
    by_uuid = client.get(f"/api/history/{WELL_UUID}")

    assert by_name.status_code == 200
    assert by_uuid.status_code == 200
    assert by_name.json() == by_uuid.json()
    assert by_name.json()["well_id"] == WELL_UUID
    assert calls == [WELL_UUID, WELL_UUID]


def test_history_unknown_identifier_returns_404(monkeypatch):
    monkeypatch.setattr("app.routers.history.supabase_client.require_well_identifier", resolve_known_well)

    response = TestClient(app).get("/api/history/NOPE-999")

    assert response.status_code == 404
    assert "NOPE-999" in response.json()["detail"]


def test_simulation_accepts_well_name_and_uuid_and_saves_resolved_uuid(monkeypatch):
    saved_inputs: list[dict] = []

    monkeypatch.setattr("app.routers.simulation.supabase_client.require_well_identifier", resolve_known_well)
    monkeypatch.setattr("app.routers.simulation.supabase_client.save_simulation",
                        lambda input_parameters, output: saved_inputs.append(input_parameters))
    client = TestClient(app)

    by_name = client.post("/api/simulation", json={**VALID_SIMULATION_INPUT, "well_id": WELL_NAME})
    by_uuid = client.post("/api/simulation", json={**VALID_SIMULATION_INPUT, "well_id": WELL_UUID})

    assert by_name.status_code == 200
    assert by_uuid.status_code == 200
    assert by_name.json()["well_id"] == WELL_UUID
    assert by_uuid.json()["well_id"] == WELL_UUID
    assert [item["well_id"] for item in saved_inputs] == [WELL_UUID, WELL_UUID]


def test_simulation_unknown_identifier_returns_404(monkeypatch):
    monkeypatch.setattr("app.routers.simulation.supabase_client.require_well_identifier", resolve_known_well)

    response = TestClient(app).post("/api/simulation", json={**VALID_SIMULATION_INPUT, "well_id": "NOPE-999"})

    assert response.status_code == 404
    assert "NOPE-999" in response.json()["detail"]


def test_optimization_accepts_well_name_and_uuid_and_saves_resolved_uuid(monkeypatch):
    saved_runs: list[dict] = []

    monkeypatch.setattr("app.routers.optimization.supabase_client.require_well_identifier", resolve_known_well)

    def fake_recommend(well_id: str, current_state: dict) -> dict:
        assert well_id == WELL_UUID
        assert current_state["well_id"] == WELL_UUID
        return {
            "well_id": well_id,
            "recommendedParameters": {"steam_volume": 901.0},
            "predictions": {
                "current": {"oil_production": 10.0},
                "recommended": {"oil_production": 12.0},
                "current_score": 1.0,
                "recommended_score": 2.0,
            },
        }

    monkeypatch.setattr("app.routers.optimization.recommend_parameters", fake_recommend)
    monkeypatch.setattr("app.routers.optimization.supabase_client.save_optimization",
                        lambda **kwargs: saved_runs.append(kwargs))
    client = TestClient(app)

    by_name = client.post("/api/optimization", json={**VALID_SIMULATION_INPUT, "well_id": WELL_NAME})
    by_uuid = client.post("/api/optimization", json={**VALID_SIMULATION_INPUT, "well_id": WELL_UUID})

    assert by_name.status_code == 200
    assert by_uuid.status_code == 200
    assert by_name.json()["well_id"] == WELL_UUID
    assert by_uuid.json()["well_id"] == WELL_UUID
    assert [item["well_id"] for item in saved_runs] == [WELL_UUID, WELL_UUID]
    assert [item["current_parameters"]["well_id"] for item in saved_runs] == [WELL_UUID, WELL_UUID]


def test_optimization_unknown_identifier_returns_404(monkeypatch):
    monkeypatch.setattr("app.routers.optimization.supabase_client.require_well_identifier", resolve_known_well)

    response = TestClient(app).post("/api/optimization", json={**VALID_SIMULATION_INPUT, "well_id": "NOPE-999"})

    assert response.status_code == 404
    assert "NOPE-999" in response.json()["detail"]


def test_forecast_still_accepts_well_name_and_uuid_and_rejects_unknown(monkeypatch):
    saved: list[dict] = []
    monkeypatch.setattr("app.routers.forecast.supabase_client.require_well_identifier", resolve_known_well)
    monkeypatch.setattr("app.routers.forecast.supabase_client.list_observations_for_well",
                        lambda well_id: [{"well_id": WELL_NAME}] * 8)
    monkeypatch.setattr("app.routers.forecast.predict_next_day",
                        lambda well_name, observations, history_source: {
                            "well_id": well_name,
                            "forecast_date": "2023-08-24",
                            "predicted_oil_production": 12.3,
                            "history_window_days": 7,
                            "model_version": "test",
                            "validation_summary": {"chronological_r2": 0.8, "held_out_well_r2": 0.7},
                            "dataset_type": "physics-informed synthetic dataset",
                            "category_basis": "synthetic-dataset-relative",
                            "field_validated": False,
                            "history_source": history_source,
                            "persistence_status": "not_attempted",
                            "input_snapshot": {"features": {}},
                        })
    monkeypatch.setattr("app.routers.forecast.supabase_client.save_forecast",
                        lambda **kwargs: saved.append(kwargs))
    client = TestClient(app)

    by_name = client.post("/api/forecast/next-day", json={"well_id": WELL_NAME})
    by_uuid = client.post("/api/forecast/next-day", json={"well_id": WELL_UUID})
    unknown = client.post("/api/forecast/next-day", json={"well_id": "NOPE-999"})

    assert by_name.status_code == 200
    assert by_uuid.status_code == 200
    assert unknown.status_code == 404
    assert by_name.json()["well_id"] == WELL_UUID
    assert by_uuid.json()["well_id"] == WELL_UUID
    assert [item["well_id"] for item in saved] == [WELL_UUID, WELL_UUID]


def test_risk_accepts_well_name_and_uuid_and_returns_resolved_uuid(monkeypatch):
    latest = {
        "well_id": WELL_UUID,
        "reservoir_temperature": 58,
        "reservoir_pressure": 4,
        "oil_viscosity": 6000,
        "oil_api": 18,
        "days_since_steam": 3,
        "spm": 8,
        "injection_pressure": 20,
        "steam_volume": 900,
        "soak_time": 24,
        "production_cutoff": 10,
        "stroke_length": 55,
        "vfd_frequency": 40,
        "fluid_level": 40,
        "water_cut": 0.2,
    }
    monkeypatch.setattr("app.routers.risk.supabase_client.require_well_identifier", resolve_known_well)
    monkeypatch.setattr("app.routers.risk.supabase_client.list_observations_for_well", lambda well_id: [latest])
    monkeypatch.setattr("app.routers.risk.predict_outputs", lambda state: {
        "rod_floating_risk": 0.18,
        "impact_loading_risk": 0.2,
        "pump_unsetting_risk": 0.34,
        "rod_failure_risk": 0.22,
    })
    monkeypatch.setattr("app.routers.risk.classify_risks", lambda state, continuous: {
        "risks": {
            "rod_floating": {"risk_score": 0.18, "category": "LOW", "classifier_probability": 0.14},
            "impact_loading": {"risk_score": 0.2, "category": "LOW", "classifier_probability": 0.17},
            "pump_unsetting": {"risk_score": 0.34, "category": "MEDIUM", "classifier_probability": 0.41},
            "rod_failure": {"risk_score": 0.22, "category": "LOW", "classifier_probability": None},
        },
        "category_basis": "synthetic-dataset-relative",
        "field_validated": False,
        "model_version": "test",
        "validation_summary": {},
    })
    client = TestClient(app)

    by_name = client.post("/api/risk", json={"well_id": WELL_NAME})
    by_uuid = client.post("/api/risk", json={"well_id": WELL_UUID})

    assert by_name.status_code == 200
    assert by_uuid.status_code == 200
    assert by_name.json()["well_id"] == WELL_UUID
    assert by_uuid.json()["well_id"] == WELL_UUID


@pytest.mark.parametrize("unknown_identifier", ["NOPE-999", "11111111-1111-1111-1111-111111111111"])
def test_unknown_name_or_uuid_returns_404_for_all_identifier_routes(monkeypatch, unknown_identifier):
    monkeypatch.setattr("app.routers.history.supabase_client.require_well_identifier", resolve_known_well)
    monkeypatch.setattr("app.routers.simulation.supabase_client.require_well_identifier", resolve_known_well)
    monkeypatch.setattr("app.routers.optimization.supabase_client.require_well_identifier", resolve_known_well)
    monkeypatch.setattr("app.routers.forecast.supabase_client.require_well_identifier", resolve_known_well)
    client = TestClient(app)
    payload = {**VALID_SIMULATION_INPUT, "well_id": unknown_identifier}

    checks = [
        client.get(f"/api/history/{unknown_identifier}"),
        client.post("/api/simulation", json=payload),
        client.post("/api/optimization", json=payload),
        client.post("/api/forecast/next-day", json={"well_id": unknown_identifier}),
        client.post("/api/risk", json={"well_id": unknown_identifier}),
    ]

    assert all(response.status_code == 404 for response in checks)
    assert all(unknown_identifier in response.json()["detail"] for response in checks)
