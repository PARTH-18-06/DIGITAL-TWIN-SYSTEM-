# API Contract — Digital Twin for CSS/SRP Optimization

Base URL locally: `http://localhost:8000`. JSON is used for every request and response. FastAPI returns `422` with field-level details for schema validation errors, `404` when a well does not exist, `502` for an upstream Supabase failure, and `503` when Supabase environment variables are absent.

Endpoints that accept `well_id` allow either the Supabase `wells.id` UUID or
the human-readable `wells.well_name` such as `BGH-001` in requests. All
responses normalize `well_id` to the resolved Supabase UUID, regardless of
which identifier was supplied.

## Model-status disclaimer

Stage 1 formulas are simplified visualization proxies. The viscosity temperature
coefficient and risk-score scaling are now informed by
`data/baghewala_synthetic_dataset_v1.csv`, but this is still not a
reverse-engineered reservoir model or a field-safety tool. Stage 2 uses XGBoost
models trained on the same synthetic baseline dataset and is also not a
field-safety tool. Next-day forecasting and risk categories are also
synthetic-dataset-relative prototype outputs. Demo database rows are explicitly
synthetic.

## Stage 1 calibration notes

Calibration used all 15,000 rows in the authoritative synthetic Baghewala
baseline dataset.

| Area | Dataset check | Stage 1 treatment |
|---|---|---|
| Viscosity vs. temperature | Fitted `oil_viscosity ~= 10005.7235 * exp(-0.0421703 * (temperature - 48))`; the fitted `k` differs from the original `0.03` by about 40.6%. | Updated the temperature coefficient to `0.04217030207890511`; `10005.7235` is documented as the fitted viscosity at 48 degC. |
| Flow speed proxy | Pearson correlation between `oil_production` and `(injection_pressure - reservoir_pressure) / oil_viscosity` is `0.775972`. | Kept the pressure-differential proxy and corrected sign convention: higher injection pressure drives forward flow. Magnitude remains unit-dependent and visual. |
| Rod floating risk | Placeholder MAE `0.1994`; affine recalibration MAE `0.0469`. | Applied a simple scale/offset calibration to the existing proxy. |
| Impact loading risk | Placeholder MAE `0.0645`; affine recalibration MAE `0.0446`. | Applied a simple scale/offset calibration to the existing proxy. |
| Composite pump failure risk | The API has one composite output, while the dataset has `pump_unsetting_risk` and `rod_failure_risk`; calibrated against their average. Placeholder MAE against those individual columns was `0.1301` and `0.0979`; calibrated MAE against the average target is `0.0370`. | Applied a simple scale/offset to the existing composite proxy. |

## Shared simulation input

Unknown fields are rejected and all numeric values must be finite. Unless marked
optional, every field is required. Data-backed ranges below extend the observed
synthetic dataset extrema outward by 5%; they are validation buffers, not
authoritative equipment safety limits.

| Parameter | Type | Unit | Description | Valid range |
|---|---|---|---|---|
| `well_id` | string | n/a | Existing well identifier; accepts either `wells.id` UUID or `wells.well_name` such as `BGH-001` | 1–128 characters |
| `temperature` | number | °C | Reservoir temperature | 44.289–152.25 |
| `pressure` | number | TBD | Reservoir pressure | 2.6315–5.649 |
| `viscosity` | number | TBD | Dataset `oil_viscosity`; API name retained for compatibility | 120.6595–13424.9535 |
| `rpm_or_spm` | number | strokes/min | Pump operating speed (`spm`) | 3.8–11.55 |
| `steam_injection_pressure` | number | TBD | Dataset `injection_pressure` | 9.5665–29.4 |
| `steam_volume` | number | TBD | Steam volume injected | 475–1473.0135 |
| `soak_time` | number | hours | CSS soak duration | 11.4–51.324 |
| `production_cutoff` | number | TBD | Production cutoff | 5.7–20.496 |
| `stroke_length` | number or null | TBD | Pump stroke length; optional | 38–73.5 when supplied |
| `vfd_frequency` | number or null | TBD | VFD operating frequency; optional | 23.75–52.5 when supplied |
| `fluid_level` | number or null | TBD | Fluid level; optional | 24.0255–54.18 when supplied |
| `water_cut` | number or null | fraction | Produced water fraction; optional | 0.0475–0.3318 when supplied |
| `oil_flow_rate` | number or null | TBD | **Optional, unvalidated placeholder:** absent from dataset | No range pending real data/team clarification |
| `valve_opening` | number or null | TBD | **Optional, unvalidated placeholder:** absent from dataset | No range pending real data/team clarification |

Example:

```json
{
  "well_id": "00000000-0000-0000-0000-000000000001",
  "temperature": 80,
  "pressure": 4.2,
  "oil_flow_rate": 30,
  "viscosity": 1000,
  "rpm_or_spm": 10,
  "valve_opening": 75,
  "steam_injection_pressure": 20,
  "steam_volume": 900,
  "soak_time": 24,
  "production_cutoff": 10,
  "stroke_length": 55,
  "vfd_frequency": 40,
  "fluid_level": 40,
  "water_cut": 0.15
}
```

## `GET /health`

No parameters. Confirms the process is running; it does not test Supabase connectivity.

```json
{"status":"ok"}
```

## `GET /api/wells`

No parameters. Returns all wells ordered by `well_name`.

```json
[
  {
    "id": "00000000-0000-0000-0000-000000000001",
    "well_name": "Synthetic Demo Well",
    "reservoir_temperature": 48,
    "reservoir_pressure": 4.0,
    "oil_properties": {"data_classification": "synthetic demo; not Baghewala field data"},
    "created_at": "2026-01-01T00:00:00+00:00"
  }
]
```

## `GET /api/wells/{well_id}`

| Parameter | Location | Type | Required | Description / valid range |
|---|---|---|---|---|
| `well_id` | path | string UUID | yes | Existing well identifier; UUID format is imposed by the supplied migration |

Returns one object in the same shape as an item from `GET /api/wells`. Returns `404` if absent.

## `POST /api/simulation`

Accepts the shared simulation input and verifies `well_id` exists. The request
may use either the well UUID or `well_name`; internally the endpoint resolves it
to the UUID before simulation and persistence. It persists the resolved,
validated input and returned output in `simulation_runs` before responding.

```json
{
  "well_id": "00000000-0000-0000-0000-000000000001",
  "simulation": {
    "flow_speed": 0.045685,
    "flow_direction": "forward",
    "temperature_color_value": 0.333333,
    "pressure_intensity": 0.21,
    "pump_stroke_speed": 10.0,
    "rod_movement_behavior": "normal",
    "warnings": [],
    "risk_scores": {
      "rod_floating_risk": 0.238802,
      "impact_loading_risk": 0.233096,
      "pump_failure_risk": 0.208288
    }
  },
  "raw_metrics": {
    "viscosity_estimate": 259.382969,
    "pump_displacement": 412.5
  }
}
```

Response field definitions:

| Field | Type | Unit/range | Three.js meaning |
|---|---|---|---|
| `flow_speed` | number | derived, unit TBD; signed | Animation magnitude; sign is also expressed by direction |
| `flow_direction` | enum | `forward`, `reverse`, `stalled` | Placeholder sign convention: injection pressure above reservoir pressure drives `forward`; reservoir pressure above injection pressure is `reverse`; zero flow (including a closed valve) is `stalled`. Use for particle/texture direction or pause state. |
| `temperature_color_value` | number | 0–1 | Shader color interpolation |
| `pressure_intensity` | number | 0–1 | Pressure glow/opacity/intensity |
| `pump_stroke_speed` | number | input RPM/SPM unit TBD | Rod/pump animation cadence |
| `rod_movement_behavior` | enum | `normal`, `floating_risk`, `impact_risk` | Animation state |
| `warnings` | string array | n/a | User-visible alert messages; estimates are labeled placeholder |
| `risk_scores.*` | number | 0–1 | UI meters/alert colors; not calibrated probabilities |
| `viscosity_estimate` | number | input viscosity unit TBD | Temperature-adjusted placeholder metric |
| `pump_displacement` | number | proxy unit TBD | Placeholder displacement metric |

## `POST /api/optimization` — Stage 2 XGBoost optimization

Accepts the shared simulation input and verifies the well exists. The request
may use either the well UUID or `well_name`; internally the endpoint resolves it
to the UUID before optimization and persistence. The selected
well must include `oil_properties.oil_api`, which is supplied by
`scripts/seed_real_wells.py` for BGH wells. The endpoint loads trained XGBoost
models from `app/ml/models/`, predicts the current input, searches seven
controllable parameters with bounded differential evolution, predicts the
recommended operating point, and persists the result to `optimization_runs`.

If models have not been trained yet, the endpoint returns `503` with a readable
message instructing the team to run `python app/ml/train_models.py`.

Controllable parameters searched by the optimizer:

| Parameter | Bounds source |
|---|---|
| `steam_volume` | Shared validation range |
| `steam_injection_pressure` | Shared validation range |
| `soak_time` | Shared validation range |
| `production_cutoff` | Shared validation range |
| `stroke_length` | Shared validation range |
| `rpm_or_spm` | Shared validation range |
| `vfd_frequency` | Shared validation range |

Fixed/measured inputs used for prediction but not optimized:

| Parameter | Source |
|---|---|
| `temperature` | Request body |
| `pressure` | Request body |
| `viscosity` | Request body |
| `oil_api` | `wells.oil_properties.oil_api` |
| `fluid_level` | Request body |
| `water_cut` | Request body |

```json
{
  "well_id": "00000000-0000-0000-0000-000000000001",
  "recommendedParameters": {
    "steam_volume": 1268.359827,
    "steam_injection_pressure": 27.106091,
    "soak_time": 31.592994,
    "production_cutoff": 12.104345,
    "stroke_length": 62.385848,
    "rpm_or_spm": 8.867766,
    "vfd_frequency": 37.508718
  },
  "predictions": {
    "current": {
      "oil_production": 16.2,
      "steam_oil_ratio": 2.1,
      "energy_per_barrel": 3.9,
      "rod_floating_risk": 0.2,
      "impact_loading_risk": 0.18,
      "pump_unsetting_risk": 0.14,
      "rod_failure_risk": 0.17
    },
    "recommended": {
      "oil_production": 24.8,
      "steam_oil_ratio": 1.6,
      "energy_per_barrel": 2.8,
      "rod_floating_risk": 0.18,
      "impact_loading_risk": 0.16,
      "pump_unsetting_risk": 0.12,
      "rod_failure_risk": 0.15
    },
    "current_score": 5.45,
    "recommended_score": 16.03,
    "predicted_oil_flow_rate": 24.8,
    "confidence": "xgboost-stage2-held-out-well-evaluation"
  }
}
```

Training uses complete-well holdout: 20 wells for training and 5 wells for
testing, then reports R2 and MAE for each target. Any held-out target with
`R2 < 0.3` should be treated as poor generalization and shown honestly in demo
notes.

## `POST /api/forecast/next-day`

Forecasts the next observation/day's oil production for one BGH well. The
request accepts a BGH well name or a matching database UUID.

```json
{
  "well_id": "BGH-001"
}
```

Example response:

```json
{
  "well_id": "00000000-0000-0000-0000-000000000001",
  "forecast_date": "2023-08-24",
  "predicted_oil_production": 18.964144,
  "history_window_days": 7,
  "model_version": "next-day-xgboost-v1",
  "validation_summary": {
    "chronological_r2": 0.781204,
    "held_out_well_r2": 0.819839
  },
  "dataset_type": "physics-informed synthetic dataset",
  "category_basis": "synthetic-dataset-relative",
  "field_validated": false,
  "history_source": "local_csv_development_fallback",
  "persistence_status": "blocked: forecast_runs migration has not been applied",
  "input_snapshot": {
    "latest_observed_at": "2023-08-23",
    "features": {"remaining feature values": "omitted here for brevity"}
  }
}
```

Feature engineering is grouped by well. Lag and rolling values use prior
observations only: lag-1, lag-7, and shifted rolling seven-day means. If fewer
than seven prior observations plus the current row are available, the endpoint
returns `422`.

Forecasting prefers Supabase `well_observations`. Local development may fall
back to the CSV only when the Supabase observation source is unavailable or
empty; the response always states the history source. Successful forecasts are
saved to `forecast_runs` once `supabase/migrations/002_observations_forecasts.sql`
has been applied.

## `POST /api/risk`

Returns continuous risk scores from the existing Stage 2 regressors plus
categorical interpretations from three leakage-audited SRP classifiers.
When only `well_id` is provided, the endpoint keeps the original history-based
behavior and assesses the latest saved observation. When the dashboard sends the
same current input fields used by simulation/optimization, those live form
values are assessed instead; `oil_api` and `days_since_steam` are filled from
the selected well/latest observation when available.

```json
{
  "well_id": "BGH-001"
}
```

Live dashboard request:

```json
{
  "well_id": "00000000-0000-0000-0000-000000000001",
  "temperature": 100,
  "pressure": 4.2,
  "viscosity": 1000,
  "rpm_or_spm": 8,
  "steam_injection_pressure": 20,
  "steam_volume": 1000,
  "soak_time": 24,
  "production_cutoff": 10,
  "stroke_length": 55,
  "vfd_frequency": 40,
  "fluid_level": 40,
  "water_cut": 0.15
}
```

Example response:

```json
{
  "well_id": "00000000-0000-0000-0000-000000000001",
  "risks": {
    "rod_floating": {
      "risk_score": 0.21478,
      "category": "LOW",
      "classifier_probability": 0.158614
    },
    "impact_loading": {
      "risk_score": 0.17276,
      "category": "LOW",
      "classifier_probability": 0.129185
    },
    "pump_unsetting": {
      "risk_score": 0.151696,
      "category": "LOW",
      "classifier_probability": 0.204655
    },
    "rod_failure": {
      "risk_score": 0.184381,
      "category": "MEDIUM",
      "classifier_probability": null
    }
  },
  "category_basis": "synthetic-dataset-relative",
  "field_validated": false,
  "model_version": "srp-risk-classifier-v1",
  "validation_summary": {}
}
```

No rod-failure classifier is exposed. Rod failure keeps the continuous risk
score as primary and receives a category from saved synthetic training-score
quantiles.

## `GET /api/history/{well_id}`

| Parameter | Location | Type | Required | Description / valid range |
|---|---|---|---|---|
| `well_id` | path | string | yes | Existing well identifier; accepts either `wells.id` UUID or `wells.well_name` such as `BGH-001` |

Returns newest-first database rows, including persisted Stage 2 optimization
runs after `POST /api/optimization` succeeds and forecast rows after
`POST /api/forecast/next-day` succeeds with the `forecast_runs` table present.

```json
{
  "well_id": "00000000-0000-0000-0000-000000000001",
  "simulation_runs": [
    {
      "id": "11111111-1111-1111-1111-111111111111",
      "well_id": "00000000-0000-0000-0000-000000000001",
      "input_parameters": {"temperature": 80, "note": "remaining shared fields omitted in this documentation sample"},
      "simulation_output": {"well_id": "00000000-0000-0000-0000-000000000001", "simulation": {}, "raw_metrics": {}},
      "created_at": "2026-01-01T00:00:00+00:00"
    }
  ],
  "optimization_runs": [],
  "forecast_runs": []
}
```

The abbreviated nested objects above illustrate database row structure only; actual stored `input_parameters` and `simulation_output` contain the complete request/response.
