# Baghewala CSS/SRP Digital Twin Backend

FastAPI integration layer for the hackathon digital twin. It validates frontend input, runs a deterministic Stage 1 simulation, persists runs in Supabase, and returns a Three.js-ready payload.

> **Engineering disclaimer:** Stage 1 now uses a few constants calibrated against `data/baghewala_synthetic_dataset_v1.csv`, including the viscosity temperature coefficient and simple risk-score scaling. The equations are still simplified visualization proxies, not a reverse-engineered reservoir model or field-safety tool.

## Local setup

From the `backend` directory:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
```

Create a Supabase project, run `supabase/migrations/001_initial_schema.sql` in its SQL editor, and put its URL and API key in `.env`. Use an appropriately scoped backend key and configure Row Level Security for production. `CORS_ORIGINS` accepts a comma-separated list.

Start the API:

```powershell
uvicorn app.main:app --reload --port 8000
```

Interactive OpenAPI docs are at `http://localhost:8000/docs`; health is at `http://localhost:8000/health`.

## Supabase Setup

1. Create a Supabase project.
2. Open **SQL Editor**, paste the complete SQL below, and run it.
3. Replace the placeholder `SUPABASE_URL` and `SUPABASE_KEY` values in `.env` with your project values. Never commit `.env` or a real key.
4. Seed the minimal integration demo wells with `python scripts/seed_demo_data.py`.
5. Seed the 25 BGH-001 through BGH-025 synthetic baseline wells with `python scripts/seed_real_wells.py`.
6. Run `supabase/migrations/002_observations_forecasts.sql` in SQL Editor, then import observation history with `python scripts/import_observations.py`.

```sql
create extension if not exists pgcrypto;

create table if not exists public.wells (
  id uuid primary key default gen_random_uuid(),
  well_name text not null,
  reservoir_temperature double precision,
  reservoir_pressure double precision,
  oil_properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.simulation_runs (
  id uuid primary key default gen_random_uuid(),
  well_id uuid not null references public.wells(id) on delete cascade,
  input_parameters jsonb not null,
  simulation_output jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.optimization_runs (
  id uuid primary key default gen_random_uuid(),
  well_id uuid not null references public.wells(id) on delete cascade,
  current_parameters jsonb not null,
  recommended_parameters jsonb not null,
  predicted_results jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists simulation_runs_well_created_idx
  on public.simulation_runs (well_id, created_at desc);
create index if not exists optimization_runs_well_created_idx
  on public.optimization_runs (well_id, created_at desc);

-- Synthetic/demo record only; this is not real Baghewala field data.
insert into public.wells
  (id, well_name, reservoir_temperature, reservoir_pressure, oil_properties)
values
  ('00000000-0000-0000-0000-000000000001', 'Synthetic Demo Well', 48, 4.0,
   '{"data_classification":"synthetic demo; not Baghewala field data"}'::jsonb)
on conflict (id) do nothing;
```

The inline SQL mirrors `supabase/migrations/001_initial_schema.sql`. Before a production deployment, enable Row Level Security and create policies appropriate to your authentication model; the hackathon migration does not invent an access policy.

Run tests:

```powershell
pytest
```

## Stage 2 ML training

Train the XGBoost optimization models after dependencies are installed:

```powershell
python app/ml/train_models.py
```

The trainer uses the authoritative synthetic Baghewala baseline dataset at
`data/baghewala_synthetic_dataset_v1.csv`. It splits by `well_id`, holding out
5 complete wells for testing and training on the other 20, then reports R2 and
MAE per prediction target. Trained `.joblib` files are written to
`app/ml/models/` and are ignored by git. `feature_order.json` is kept alongside
them so inference always uses the same column order as training.

## 3D mapping

- `flow_speed` controls fluid particle/texture animation speed; use `flow_direction` for direction and pause on `stalled`.
- `temperature_color_value` is a clamped 0–1 shader color interpolation input.
- `pressure_intensity` is a clamped 0–1 visual intensity input (glow, scale, or opacity).
- `pump_stroke_speed` controls pump/rod animation cadence.
- `rod_movement_behavior` selects normal, floating-risk, or impact-risk animation states.
- `warnings` and `risk_scores` drive overlays, badges, and alert coloration.

The precise endpoint and field contract is in [docs/API_CONTRACT.md](docs/API_CONTRACT.md).

## Stage 2

`POST /api/optimization` uses seven XGBoost regressors trained by
`app/ml/train_models.py` to predict oil production, steam-oil ratio, energy per
barrel, and four risk targets. It then searches the controllable CSS/SRP
parameters with `scipy.optimize.differential_evolution` and persists the real
optimization result in `optimization_runs`.

The optimizer maximizes production while penalizing energy, steam-oil ratio,
and average risk. Risk carries the highest default weight because safer
operating recommendations matter more than marginal production gains in this
hackathon demo. These weights are tunable constants in `app/ml/optimizer.py`.

## Forecasting and risk assessment

Next-day forecasting and categorical SRP risk assessment are integrated into the
same FastAPI app; no second server is required.

Train the added models from the project root or backend virtualenv:

```powershell
python ..\ai_ml\training\forecasting\train_next_day.py
python ..\ai_ml\training\risk_classification\train_classifiers.py
```

The forecast model uses lag-1, lag-7, shifted rolling seven-day means, and
physics-inspired mobility features. Lag and rolling features are calculated
within each well only, and rolling windows are shifted so current or future
targets do not leak into features.

Risk classifiers use CSS/SRP/reservoir operating features only. Risk target
columns are excluded from inputs, and each high-risk threshold is calculated
from training data only. Categories are synthetic-dataset-relative labels, not
validated equipment safety limits.

Runtime endpoints:

```text
POST /api/forecast/next-day
POST /api/risk
```

Forecasting prefers `well_observations` in Supabase. If that table has not been
migrated/imported in a local development environment, the backend uses the
checked-in CSV as an explicit `local_csv_development_fallback` and reports that
source in the response. Forecast persistence to `forecast_runs` requires running
the second migration.
