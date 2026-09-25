from __future__ import annotations

import csv
from dataclasses import dataclass
from datetime import UTC, datetime
from io import StringIO
from typing import Any
from uuid import uuid4

from fastapi import HTTPException


MAX_CSV_BYTES = 2_000_000
MAX_ROWS = 10_000

IDENTIFIER_COLUMNS = ["well_identifier"]
REQUIRED_NUMERIC_COLUMNS = [
    "oil_production",
    "reservoir_temperature",
    "reservoir_pressure",
    "steam_volume",
    "injection_pressure",
    "soak_time",
    "production_cutoff",
    "oil_viscosity",
    "oil_api",
    "days_since_steam",
    "water_cut",
    "fluid_level",
    "stroke_length",
    "spm",
    "vfd_frequency",
]
OPTIONAL_NUMERIC_COLUMNS = [
    "cycle_number",
    "rod_floating_risk",
    "impact_loading_risk",
    "pump_unsetting_risk",
    "rod_failure_risk",
]
REQUIRED_COLUMNS = [*IDENTIFIER_COLUMNS, "observed_at", *REQUIRED_NUMERIC_COLUMNS]
OPTIONAL_COLUMNS = OPTIONAL_NUMERIC_COLUMNS
TEMPLATE_COLUMNS = [*REQUIRED_COLUMNS, *OPTIONAL_COLUMNS]

# Dataset-informed UI/API ranges with small buffer from SimulationInput.
# These are validation guardrails for obvious unit/data-entry errors, not
# expert-approved operating limits or equipment safety limits.
RANGES: dict[str, tuple[float, float]] = {
    "reservoir_temperature": (44.289, 152.25),
    "reservoir_pressure": (2.6315, 5.649),
    "oil_viscosity": (120.6595, 13424.9535),
    "spm": (3.8, 11.55),
    "injection_pressure": (9.5665, 29.4),
    "steam_volume": (475.0, 1473.0135),
    "soak_time": (11.4, 51.324),
    "production_cutoff": (5.7, 20.496),
    "stroke_length": (38.0, 73.5),
    "vfd_frequency": (23.75, 52.5),
    "fluid_level": (24.0255, 54.18),
    "water_cut": (0.0475, 0.3318),
}


@dataclass(frozen=True)
class ImportIssue:
    row: int
    field: str
    message: str


def template_csv() -> str:
    output = StringIO()
    writer = csv.writer(output, lineterminator="\n")
    writer.writerow(TEMPLATE_COLUMNS)
    return output.getvalue()


def synthetic_sample_csv() -> str:
    rows = [
        TEMPLATE_COLUMNS,
        [
            "BGH-001",
            "2026-01-01T00:00:00Z",
            "18.50",
            "82.0",
            "4.20",
            "900",
            "20",
            "24",
            "10",
            "1000",
            "18.5",
            "3",
            "0.15",
            "40",
            "55",
            "8",
            "40",
            "1",
            "",
            "",
            "",
            "",
        ],
    ]
    output = StringIO()
    writer = csv.writer(output, lineterminator="\n")
    writer.writerows(rows)
    return output.getvalue()


def validation_notes() -> dict[str, Any]:
    return {
        "required_columns": REQUIRED_COLUMNS,
        "optional_columns": OPTIONAL_COLUMNS,
        "timestamp_format": "ISO-8601 with timezone preferred, e.g. 2026-01-01T00:00:00Z. Date-only values are accepted as UTC midnight.",
        "missing_values": "Required values must be present. Optional blanks are stored as null. Missing values are never converted to zero.",
        "units": {
            "oil_production": "model units/day or agreed field unit; keep consistent per dataset",
            "reservoir_temperature": "°C",
            "reservoir_pressure": "same pressure unit used by the current model contract",
            "steam_volume": "m³",
            "injection_pressure": "same pressure unit used by the current model contract",
            "soak_time": "hours",
            "production_cutoff": "same cutoff unit used by current CSS contract",
            "oil_viscosity": "same viscosity unit used by model training data",
            "water_cut": "fraction, 0-1",
            "fluid_level": "same unit used by current model contract",
            "stroke_length": "inches",
            "spm": "strokes per minute",
            "vfd_frequency": "Hz",
        },
        "provenance": "Set data_kind to field_measurement for supplied field data or synthetic_sample for samples. Field data is not automatically field-validated.",
    }


def parse_and_validate_csv(
    csv_text: str,
    wells: list[dict[str, Any]],
    existing_keys: set[tuple[str, str]],
    *,
    dataset_id: str,
    source: str,
    data_kind: str,
) -> dict[str, Any]:
    if len(csv_text.encode("utf-8")) > MAX_CSV_BYTES:
        raise HTTPException(status_code=413, detail=f"CSV exceeds {MAX_CSV_BYTES} byte limit.")

    reader = csv.DictReader(StringIO(csv_text))
    headers = reader.fieldnames or []
    errors: list[ImportIssue] = []
    warnings: list[ImportIssue] = []
    rows: list[dict[str, Any]] = []
    seen_keys: set[tuple[str, str]] = set()
    well_lookup = _well_lookup(wells)

    for column in REQUIRED_COLUMNS:
        if column not in headers:
            errors.append(ImportIssue(0, column, "Missing required header."))
    unknown_headers = sorted(set(headers) - set(TEMPLATE_COLUMNS))
    for column in unknown_headers:
        warnings.append(ImportIssue(0, column, "Unknown column will be ignored."))

    raw_rows = list(reader)
    if len(raw_rows) > MAX_ROWS:
        raise HTTPException(status_code=413, detail=f"CSV has {len(raw_rows)} rows; limit is {MAX_ROWS}.")

    if any(issue.row == 0 for issue in errors):
        return _result(dataset_id, source, data_kind, len(raw_rows), [], errors, warnings)

    for index, raw in enumerate(raw_rows, start=2):
        parsed, row_errors, row_warnings = _parse_row(index, raw, well_lookup)
        errors.extend(row_errors)
        warnings.extend(row_warnings)
        if parsed is None:
            continue
        key = (parsed["well_id"], parsed["observed_at"])
        if key in seen_keys:
            errors.append(ImportIssue(index, "observed_at", "Duplicate well/timestamp pair within this CSV."))
            continue
        seen_keys.add(key)
        if key in existing_keys:
            warnings.append(ImportIssue(index, "observed_at", "Observation already exists and will be skipped, not overwritten."))
            parsed["_duplicate_existing"] = True
        rows.append(parsed)

    return _result(dataset_id, source, data_kind, len(raw_rows), rows, errors, warnings)


def rows_for_insert(preview: dict[str, Any]) -> tuple[list[dict[str, Any]], str, str]:
    if preview["errors"]:
        return [], "", ""
    upload_id = str(uuid4())
    uploaded_at = datetime.now(UTC).isoformat()
    output = []
    for row in preview["validated_rows"]:
        if row.get("_duplicate_existing"):
            continue
        clean = {key: value for key, value in row.items() if not key.startswith("_")}
        clean.update({
            "observation_source": preview["source"],
            "upload_id": upload_id,
            "uploaded_at": uploaded_at,
            "dataset_identifier": preview["dataset_id"],
            "data_kind": preview["data_kind"],
            "field_validated": False,
        })
        output.append(clean)
    return output, upload_id, uploaded_at


def _parse_row(index: int, raw: dict[str, str], well_lookup: dict[str, dict[str, Any]]):
    errors: list[ImportIssue] = []
    warnings: list[ImportIssue] = []
    identifier = (raw.get("well_identifier") or "").strip()
    well = well_lookup.get(identifier)
    if not identifier:
        errors.append(ImportIssue(index, "well_identifier", "Well identifier is required."))
    elif well is None:
        errors.append(ImportIssue(index, "well_identifier", f"Unknown well identifier '{identifier}'. Use wells.id or wells.well_name."))

    observed_at = _parse_timestamp(index, raw.get("observed_at"), errors)
    values: dict[str, Any] = {}
    for column in REQUIRED_NUMERIC_COLUMNS:
        values[column] = _parse_number(index, raw.get(column), column, True, errors, warnings)
    for column in OPTIONAL_NUMERIC_COLUMNS:
        values[column] = _parse_number(index, raw.get(column), column, False, errors, warnings)

    if errors:
        return None, errors, warnings
    assert well is not None and observed_at is not None
    return {
        "well_id": well["id"],
        "well_name": well["well_name"],
        "observed_at": observed_at,
        **values,
    }, errors, warnings


def _parse_timestamp(index: int, value: str | None, errors: list[ImportIssue]) -> str | None:
    raw = (value or "").strip()
    if not raw:
        errors.append(ImportIssue(index, "observed_at", "Timestamp is required."))
        return None
    try:
        normalized = raw.replace("Z", "+00:00")
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        errors.append(ImportIssue(index, "observed_at", "Use ISO-8601 timestamp/date, e.g. 2026-01-01T00:00:00Z."))
        return None
    return parsed.date().isoformat()


def _parse_number(
    index: int,
    value: str | None,
    column: str,
    required: bool,
    errors: list[ImportIssue],
    warnings: list[ImportIssue],
) -> float | int | None:
    raw = (value or "").strip()
    if not raw:
        if required:
            errors.append(ImportIssue(index, column, "Required numeric value is missing."))
        return None
    try:
        number = float(raw)
    except ValueError:
        errors.append(ImportIssue(index, column, "Value must be numeric."))
        return None
    if not (number == number and number not in (float("inf"), float("-inf"))):
        errors.append(ImportIssue(index, column, "Value must be finite."))
        return None
    if column == "cycle_number":
        if not number.is_integer() or number < 0:
            errors.append(ImportIssue(index, column, "Cycle number must be a non-negative integer."))
            return None
        return int(number)
    if column in RANGES:
        low, high = RANGES[column]
        if number < low or number > high:
            warnings.append(ImportIssue(index, column, f"Value is outside current synthetic-data validation range {low:g}–{high:g}; confirm units before import."))
    if column.endswith("_risk") and not 0 <= number <= 1:
        errors.append(ImportIssue(index, column, "Risk values must be in the 0-1 range."))
        return None
    return number


def _well_lookup(wells: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    lookup: dict[str, dict[str, Any]] = {}
    for well in wells:
        lookup[str(well["id"])] = well
        lookup[str(well["well_name"])] = well
    return lookup


def _result(
    dataset_id: str,
    source: str,
    data_kind: str,
    total_rows: int,
    rows: list[dict[str, Any]],
    errors: list[ImportIssue],
    warnings: list[ImportIssue],
) -> dict[str, Any]:
    duplicate_rows = sum(1 for row in rows if row.get("_duplicate_existing"))
    importable_rows = sum(1 for row in rows if not row.get("_duplicate_existing"))
    return {
        "dataset_id": dataset_id,
        "source": source,
        "data_kind": data_kind,
        "field_validated": False,
        "total_rows": total_rows,
        "valid_rows": len(rows),
        "importable_rows": importable_rows,
        "duplicate_rows": duplicate_rows,
        "error_count": len(errors),
        "warning_count": len(warnings),
        "errors": [issue.__dict__ for issue in errors],
        "warnings": [issue.__dict__ for issue in warnings],
        "preview_rows": [{key: value for key, value in row.items() if not key.startswith("_")} for row in rows[:10]],
        "validated_rows": rows,
        "template_columns": TEMPLATE_COLUMNS,
        "required_columns": REQUIRED_COLUMNS,
        "optional_columns": OPTIONAL_COLUMNS,
    }
