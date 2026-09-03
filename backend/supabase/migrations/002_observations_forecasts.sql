create table if not exists public.well_observations (
  id uuid primary key default gen_random_uuid(),
  well_id uuid not null references public.wells(id) on delete cascade,
  well_name text not null,
  observed_at date not null,
  cycle_number integer,
  days_since_steam double precision,
  steam_volume double precision,
  injection_pressure double precision,
  soak_time double precision,
  production_cutoff double precision,
  reservoir_temperature double precision,
  reservoir_pressure double precision,
  oil_viscosity double precision,
  oil_api double precision,
  stroke_length double precision,
  spm double precision,
  vfd_frequency double precision,
  fluid_level double precision,
  water_cut double precision,
  oil_production double precision,
  created_at timestamptz not null default now(),
  unique (well_id, observed_at)
);

create index if not exists well_observations_well_date_idx
  on public.well_observations (well_id, observed_at desc);

create table if not exists public.forecast_runs (
  id uuid primary key default gen_random_uuid(),
  well_id uuid not null references public.wells(id) on delete cascade,
  forecast_date date not null,
  input_snapshot jsonb not null,
  predicted_oil_production double precision not null,
  risk_output jsonb not null default '{}'::jsonb,
  model_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists forecast_runs_well_created_idx
  on public.forecast_runs (well_id, created_at desc);
