import pandas as pd
from fastapi.testclient import TestClient

from app.main import app
from app.ml.forecasting import features
from app.ml.forecasting.predictor import ForecastArtifactsMissing


def test_lag_and_rolling_features_are_within_each_well():
    frame = pd.DataFrame({
        "well_id": ["A"] * 9 + ["B"] * 9,
        "date": pd.date_range("2024-01-01", periods=9).tolist() * 2,
        "reservoir_temperature": list(range(9)) + list(range(100, 109)),
        "reservoir_pressure": list(range(10, 19)) + list(range(110, 119)),
        "oil_viscosity": list(range(20, 29)) + list(range(120, 129)),
        "water_cut": list(range(30, 39)) + list(range(130, 139)),
    })

    prepared = features.add_temporal_features(frame)
    b_first = prepared[prepared["well_id"] == "B"].iloc[0]
    b_eighth = prepared[prepared["well_id"] == "B"].iloc[7]

    assert pd.isna(b_first["reservoir_temperature_lag1"])
    assert b_eighth["reservoir_temperature_lag7"] == 100
    assert b_eighth["reservoir_temperature_roll7_mean"] == sum(range(100, 107)) / 7


def test_next_day_target_is_not_used_as_feature():
    assert "oil_production_next_day" not in features.FORECAST_FEATURE_COLUMNS
    assert "oil_production" not in features.FORECAST_FEATURE_COLUMNS


def test_forecast_route_schema_and_persistence(monkeypatch):
    saved = {}
    monkeypatch.setattr("app.routers.forecast.supabase_client.require_well_identifier",
                        lambda well_id: {"id": "uuid-1", "well_name": "BGH-001"})
    monkeypatch.setattr("app.routers.forecast.supabase_client.list_observations_for_well",
                        lambda well_id: [{"well_id": "BGH-001"}] * 8)
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
                        lambda **kwargs: saved.update(kwargs))

    response = TestClient(app).post("/api/forecast/next-day", json={"well_id": "BGH-001"})

    assert response.status_code == 200
    body = response.json()
    assert body["well_id"] == "uuid-1"
    assert body["category_basis"] == "synthetic-dataset-relative"
    assert saved["predicted_oil_production"] == 12.3


def test_missing_forecast_artifacts_return_503(monkeypatch):
    monkeypatch.setattr("app.routers.forecast.supabase_client.require_well_identifier",
                        lambda well_id: {"id": "uuid-1", "well_name": "BGH-001"})
    monkeypatch.setattr("app.routers.forecast.supabase_client.list_observations_for_well",
                        lambda well_id: [{"well_id": "BGH-001"}] * 8)

    def missing(*args, **kwargs):
        raise ForecastArtifactsMissing("missing forecast model")

    monkeypatch.setattr("app.routers.forecast.predict_next_day", missing)

    response = TestClient(app).post("/api/forecast/next-day", json={"well_id": "BGH-001"})

    assert response.status_code == 503
    assert "missing forecast model" in response.json()["detail"]
