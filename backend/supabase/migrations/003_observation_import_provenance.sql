alter table public.well_observations
  add column if not exists observation_source text,
  add column if not exists upload_id uuid,
  add column if not exists uploaded_at timestamptz,
  add column if not exists dataset_identifier text,
  add column if not exists data_kind text,
  add column if not exists field_validated boolean not null default false;

create index if not exists well_observations_upload_idx
  on public.well_observations (upload_id);

comment on column public.well_observations.data_kind is
  'synthetic_sample or field_measurement. User-supplied field measurements are not automatically verified or field-validated.';
