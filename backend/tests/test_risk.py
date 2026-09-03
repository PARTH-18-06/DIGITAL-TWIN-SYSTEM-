from fastapi.testclient import TestClient

from app.main import app
from app.ml.risk.categories import CATEGORY_BASIS
from app.ml.risk.classifier import FORBIDDEN_FEATURE_COLUMNS, RISK_FEATURE_COLUMNS


def test_risk_feature_order_excludes_leakage_columns():
    assert not FORBIDDEN_FEATURE_COLUMNS.intersection(RISK_FEATURE_COLUMNS)


def test_categories_are_synthetic_dataset_relative():
    assert CATEGORY_BASIS == "synthetic-dataset-relative"


def test_risk_route_includes_continuous_scores_and_categories(monkeypatch):
    latest = {
        "well_id": "BGH-001",
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
    monkeypatch.setattr("app.routers.risk.supabase_client.require_well_identifier",
                        lambda well_id: {"id": "uuid-1", "well_name": "BGH-001"})
    monkeypatch.setattr("app.routers.risk.supabase_client.list_observations_for_well",
                        lambda well_id: [latest])
    monkeypatch.setattr("app.routers.risk.predict_outputs",
                        lambda state: {
                            "rod_floating_risk": 0.18,
                            "impact_loading_risk": 0.2,
                            "pump_unsetting_risk": 0.34,
                            "rod_failure_risk": 0.22,
                        })
    monkeypatch.setattr("app.routers.risk.classify_risks",
                        lambda state, continuous: {
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

    response = TestClient(app).post("/api/risk", json={"well_id": "BGH-001"})

    assert response.status_code == 200
    body = response.json()
    assert body["well_id"] == "uuid-1"
    assert body["risks"]["rod_floating"]["risk_score"] == 0.18
    assert body["risks"]["pump_unsetting"]["category"] == "MEDIUM"
    assert body["risks"]["rod_failure"]["classifier_probability"] is None
