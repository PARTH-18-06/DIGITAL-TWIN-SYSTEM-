"""Insert three unmistakably synthetic demo wells into configured Supabase."""

from pathlib import Path
import sys

# Allow execution as `python scripts/seed_demo_data.py` from backend/.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import get_supabase_client, get_settings  # noqa: E402


DEMO_WELLS = [
    {
        "well_name": "DEMO-001 (synthetic)",
        "reservoir_temperature": 80.0,
        "reservoir_pressure": 4.2,
        "oil_properties": {"viscosity": 1000.0, "data_classification": "synthetic demo"},
    },
    {
        "well_name": "DEMO-002 (synthetic)",
        "reservoir_temperature": 95.0,
        "reservoir_pressure": 4.7,
        "oil_properties": {"viscosity": 2500.0, "data_classification": "synthetic demo"},
    },
    {
        "well_name": "DEMO-003 (synthetic)",
        "reservoir_temperature": 110.0,
        "reservoir_pressure": 3.8,
        "oil_properties": {"viscosity": 5000.0, "data_classification": "synthetic demo"},
    },
]


def main() -> int:
    if not get_settings().supabase_configured:
        print("Supabase is not configured. Replace placeholder values in backend/.env first.")
        return 1
    client = get_supabase_client()
    assert client is not None
    existing = client.table("wells").select("well_name").execute().data or []
    existing_names = {row["well_name"] for row in existing}
    pending = [well for well in DEMO_WELLS if well["well_name"] not in existing_names]
    if pending:
        client.table("wells").insert(pending).execute()
    print(f"Synthetic demo wells present: {len(DEMO_WELLS)}; inserted now: {len(pending)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
