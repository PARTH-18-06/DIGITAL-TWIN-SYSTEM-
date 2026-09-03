"""Import the 15,000-row synthetic Baghewala baseline into Supabase."""

from pathlib import Path
import sys

import pandas as pd
from postgrest.exceptions import APIError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import get_settings, get_supabase_client  # noqa: E402


DATASET_PATH = Path(__file__).resolve().parents[1] / "data" / "baghewala_synthetic_dataset_v1.csv"
BATCH_SIZE = 500


def _chunks(rows: list[dict], size: int):
    for index in range(0, len(rows), size):
        yield rows[index:index + size]


def main() -> int:
    if not get_settings().supabase_configured:
        print("Supabase is not configured. Replace placeholder values in backend/.env first.")
        return 1

    client = get_supabase_client()
    assert client is not None

    wells = client.table("wells").select("id,well_name").execute().data or []
    well_ids = {row["well_name"]: row["id"] for row in wells if str(row["well_name"]).startswith("BGH-")}
    df = pd.read_csv(DATASET_PATH, parse_dates=["date"])
    missing = sorted(set(df["well_id"]) - set(well_ids))
    if missing:
        print("Missing BGH wells in Supabase. Run scripts/seed_real_wells.py first: " + ", ".join(missing))
        return 1

    try:
        before = client.table("well_observations").select("id", count="exact").execute().count or 0
    except APIError as exc:
        print(f"Could not read well_observations: {exc.message}")
        print("Run supabase/migrations/002_observations_forecasts.sql in Supabase SQL Editor first.")
        return 1
    rows = []
    for row in df.itertuples(index=False):
        rows.append({
            "well_id": well_ids[row.well_id],
            "well_name": row.well_id,
            "observed_at": row.date.date().isoformat(),
            "cycle_number": int(row.cycle_number),
            "days_since_steam": float(row.days_since_steam),
            "steam_volume": float(row.steam_volume),
            "injection_pressure": float(row.injection_pressure),
            "soak_time": float(row.soak_time),
            "production_cutoff": float(row.production_cutoff),
            "reservoir_temperature": float(row.reservoir_temperature),
            "reservoir_pressure": float(row.reservoir_pressure),
            "oil_viscosity": float(row.oil_viscosity),
            "oil_api": float(row.oil_api),
            "stroke_length": float(row.stroke_length),
            "spm": float(row.spm),
            "vfd_frequency": float(row.vfd_frequency),
            "fluid_level": float(row.fluid_level),
            "water_cut": float(row.water_cut),
            "oil_production": float(row.oil_production),
        })

    for batch in _chunks(rows, BATCH_SIZE):
        try:
            client.table("well_observations").upsert(batch, on_conflict="well_id,observed_at").execute()
        except APIError as exc:
            print(f"Import failed: {exc.message}")
            return 1

    after = client.table("well_observations").select("id", count="exact").execute().count or 0
    print(f"well_observations before: {before}")
    print(f"Rows processed from CSV: {len(rows)}")
    print(f"well_observations after: {after}")
    print(f"Net new rows: {after - before}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
