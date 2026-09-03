"""Seed the 25 authoritative synthetic Baghewala wells into Supabase.

The script is idempotent by well_name. It only inserts missing BGH-XXX wells
and never deletes existing demo or manually created rows.
"""

from pathlib import Path
import sys

import pandas as pd

# Allow execution as `python scripts/seed_real_wells.py` from backend/.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import get_settings, get_supabase_client  # noqa: E402


DATASET_PATH = Path(__file__).resolve().parents[1] / "data" / "baghewala_synthetic_dataset_v1.csv"


def _latest_well_rows() -> list[dict]:
    df = pd.read_csv(DATASET_PATH, parse_dates=["date"])
    latest = df.sort_values("date").groupby("well_id", as_index=False).tail(1)
    latest = latest.sort_values("well_id")

    wells: list[dict] = []
    for row in latest.itertuples(index=False):
        wells.append(
            {
                "well_name": row.well_id,
                "reservoir_temperature": float(row.reservoir_temperature),
                "reservoir_pressure": float(row.reservoir_pressure),
                "oil_properties": {
                    "oil_viscosity": float(row.oil_viscosity),
                    "oil_api": float(row.oil_api),
                    "data_classification": f"synthetic baseline dataset ({row.well_id})",
                    "dataset_latest_record_date": row.date.date().isoformat(),
                },
            }
        )
    return wells


def main() -> int:
    if not get_settings().supabase_configured:
        print("Supabase is not configured. Replace placeholder values in backend/.env first.")
        return 1

    client = get_supabase_client()
    assert client is not None

    before_rows = client.table("wells").select("id,well_name").execute().data or []
    before_count = len(before_rows)
    existing_names = {row["well_name"] for row in before_rows}

    target_wells = _latest_well_rows()
    pending = [well for well in target_wells if well["well_name"] not in existing_names]
    if pending:
        client.table("wells").insert(pending).execute()

    after_rows = client.table("wells").select("id,well_name").execute().data or []
    after_count = len(after_rows)
    real_count = sum(1 for row in after_rows if str(row["well_name"]).startswith("BGH-"))

    print(f"Total wells before: {before_count}")
    print(f"Inserted real Baghewala wells now: {len(pending)}")
    print(f"Total wells after: {after_count}")
    print(f"BGH wells now present: {real_count}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
