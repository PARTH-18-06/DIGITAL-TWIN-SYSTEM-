# Field Data CSV Import Workflow

This project does not currently include real field data. The CSV import workflow is preparation for future operator-supplied observations and remains decision-support only.

## Files and endpoints

- Blank template: `GET /api/import/observations/template.csv`
- Clearly labeled synthetic example: `GET /api/import/observations/synthetic-sample.csv`
- Validation rules: `GET /api/import/observations/rules`
- Dry-run validation: `POST /api/import/observations/dry-run`
- Confirmed import: `POST /api/import/observations/confirm`

Confirmed imports are disabled by default. Enable only on a trusted local/development backend:

```powershell
$env:ALLOW_LOCAL_CSV_IMPORT = "true"
```

Do not enable the write endpoint on a public unauthenticated production deployment.

## Required columns

`well_identifier, observed_at, oil_production, reservoir_temperature, reservoir_pressure, steam_volume, injection_pressure, soak_time, production_cutoff, oil_viscosity, oil_api, days_since_steam, water_cut, fluid_level, stroke_length, spm, vfd_frequency`

`well_identifier` may be either the Supabase well UUID or the well name such as `BGH-001`.

## Optional columns

`cycle_number, rod_floating_risk, impact_loading_risk, pump_unsetting_risk, rod_failure_risk`

Optional blank cells are stored as missing/null. Required values must be present.

## Units and timestamps

- `observed_at`: ISO-8601 date/time with timezone preferred, for example `2026-01-01T00:00:00Z`. Date-only values are treated as UTC calendar dates.
- Temperature: °C.
- Steam volume: m³.
- Soak time: hours.
- Water cut: fraction from 0 to 1.
- Stroke speed: `spm`.
- VFD frequency: Hz.
- Pressure, viscosity, cutoff, fluid level, and production must use the same units agreed for the current model contract.

The validator uses current synthetic-data API ranges only as guardrails for likely unit/data-entry mistakes. These are not expert-approved operating limits.

## Missing data and validation

The import workflow never:

- guesses units,
- converts missing values to zero,
- interpolates gaps,
- discards invalid rows silently, or
- overwrites existing observations silently.

Dry-run preview reports row-level errors and warnings. Errors must be resolved before import. Existing `(well_id, observed_at)` rows are skipped, not overwritten, making retries safe.

## Provenance

Each confirmed row records:

- `observation_source`
- `dataset_identifier`
- `upload_id`
- `uploaded_at`
- `data_kind`: `synthetic_sample` or `field_measurement`
- `field_validated`: always `false` for uploaded data

User-supplied field measurements are not automatically verified, field-validated, or approved for field operations.

## When real data becomes available

1. Add the provenance migration in `backend/supabase/migrations/003_observation_import_provenance.sql` to the target database.
2. Run the backend locally with Supabase credentials and `ALLOW_LOCAL_CSV_IMPORT=true`.
3. Download the blank template from the dashboard.
4. Fill required columns with consistent units.
5. Run dry-run preview and fix all errors.
6. Confirm import only after reviewing warnings.
7. Re-run forecast/risk workflows. Do not retrain models or claim validation unless a separate calibration/validation process is completed.
