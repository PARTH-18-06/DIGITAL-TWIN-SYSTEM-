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

create index if not exists simulation_runs_well_created_idx on public.simulation_runs (well_id, created_at desc);
create index if not exists optimization_runs_well_created_idx on public.optimization_runs (well_id, created_at desc);

-- Synthetic/demo record only; this is not real Baghewala field data.
insert into public.wells (id, well_name, reservoir_temperature, reservoir_pressure, oil_properties)
values ('00000000-0000-0000-0000-000000000001', 'Synthetic Demo Well', 48, 4.0,
        '{"data_classification":"synthetic demo; not Baghewala field data"}'::jsonb)
on conflict (id) do nothing;
