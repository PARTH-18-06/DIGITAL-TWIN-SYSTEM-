"""End-to-end verification for a running local API and configured Supabase.

Run from backend/:  python verify.py
Override the target with API_BASE_URL, for example http://127.0.0.1:8000.
"""

import json
import os
import sys
from typing import Any

import httpx

from app.config import get_supabase_client
from app.main import app

BASE_URL = os.getenv("API_BASE_URL", "http://127.0.0.1:8000")
FAKE_ID = "ffffffff-ffff-ffff-ffff-ffffffffffff"

SAMPLE: dict[str, Any] = {
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
    "water_cut": 0.15,
}


def show(label: str, response: httpx.Response) -> Any:
    print(f"\n{label}: HTTP {response.status_code}")
    try:
        body = response.json()
        print(json.dumps(body, indent=2))
        return body
    except ValueError:
        print(response.text)
        return None


def count_runs(well_id: str) -> int:
    client = get_supabase_client()
    if client is None:
        raise RuntimeError("SUPABASE_URL and SUPABASE_KEY are not configured")
    response = (client.table("simulation_runs").select("id", count="exact")
                .eq("well_id", well_id).execute())
    return int(response.count or 0)


def _flatten_routes(routes: list[Any]):
    """Yield leaf routes, including FastAPI 0.141+'s lazily included routers."""
    for route in routes:
        if hasattr(route, "path"):
            yield route
        elif hasattr(route, "original_router"):
            yield from _flatten_routes(route.original_router.routes)


def print_routes() -> set[tuple[str, str]]:
    print("\nREGISTERED ROUTES")
    print(f"{'METHOD':<10} PATH")
    print(f"{'-' * 10} {'-' * 45}")
    registered: set[tuple[str, str]] = set()
    public_routes = list(_flatten_routes(app.routes))
    for route in sorted(public_routes, key=lambda item: item.path):
        for method in sorted(getattr(route, "methods", set()) - {"HEAD", "OPTIONS"}):
            print(f"{method:<10} {route.path}")
            registered.add((method, route.path))
    return registered


def main() -> int:
    checks: dict[str, bool] = {
        "Server boots": False,
        "All routes registered": False,
        "GET /api/wells works": False,
        "GET /api/wells/{id} works (200 + 404 cases)": False,
        "POST /api/simulation returns valid shape": False,
        "POST /api/optimization responds": False,
        "GET /api/history/{id} works": False,
        "Supabase write confirmed on /api/simulation": False,
        "Error handling returns clean 400/422, not 500": False,
    }

    routes = print_routes()
    required = {
        ("GET", "/api/wells"), ("GET", "/api/wells/{well_id}"),
        ("POST", "/api/simulation"), ("POST", "/api/optimization"),
        ("GET", "/api/history/{well_id}"),
    }
    checks["All routes registered"] = required <= routes

    try:
        with httpx.Client(base_url=BASE_URL, timeout=20) as client:
            health = show("GET /health", client.get("/health"))
            checks["Server boots"] = health == {"status": "ok"}

            wells_response = client.get("/api/wells")
            wells = show("GET /api/wells", wells_response)
            checks["GET /api/wells works"] = wells_response.status_code == 200 and isinstance(wells, list)

            fake_response = client.get(f"/api/wells/{FAKE_ID}")
            fake = show("GET /api/wells/{fake_id}", fake_response)
            fake_ok = fake is not None and fake_response.status_code == 404

            # Validation happens before database access, so these exercise error handling
            # even when the local Supabase variables have not yet been configured.
            missing = show("POST /api/simulation (missing temperature)",
                           client.post("/api/simulation", json={"well_id": FAKE_ID}))
            invalid_payload = {"well_id": FAKE_ID, **SAMPLE, "temperature": -300}
            invalid_response = client.post("/api/simulation", json=invalid_payload)
            invalid = show("POST /api/simulation (temperature below absolute zero)", invalid_response)
            checks["Error handling returns clean 400/422, not 500"] = (
                isinstance(missing, dict) and isinstance(invalid, dict)
                and invalid_response.status_code == 422
            )

            if not isinstance(wells, list) or not wells:
                print("\nNo seeded well is available; database-dependent checks cannot proceed.")
            else:
                well_id = str(wells[0]["id"])
                seeded_response = client.get(f"/api/wells/{well_id}")
                show("GET /api/wells/{seeded_id}", seeded_response)
                checks["GET /api/wells/{id} works (200 + 404 cases)"] = (
                    seeded_response.status_code == 200 and fake_ok
                )

                payload = {"well_id": well_id, **SAMPLE}
                before = count_runs(well_id)
                simulation_response = client.post("/api/simulation", json=payload)
                simulation = show("POST /api/simulation", simulation_response)
                after = count_runs(well_id)
                print(f"\nSupabase simulation_runs count: before={before}, after={after}")
                checks["Supabase write confirmed on /api/simulation"] = after == before + 1
                checks["POST /api/simulation returns valid shape"] = (
                    simulation_response.status_code == 200 and isinstance(simulation, dict)
                    and {"well_id", "simulation", "raw_metrics"} <= simulation.keys()
                    and {"flow_speed", "flow_direction", "temperature_color_value",
                         "pressure_intensity", "pump_stroke_speed", "rod_movement_behavior",
                         "warnings", "risk_scores"} <= simulation["simulation"].keys()
                )

                optimization_response = client.post("/api/optimization", json=payload)
                optimization = show("POST /api/optimization", optimization_response)
                checks["POST /api/optimization responds"] = (
                    optimization_response.status_code == 200 and isinstance(optimization, dict)
                    and {"recommendedParameters", "predictions"} <= optimization.keys()
                )

                history_response = client.get(f"/api/history/{well_id}")
                history = show("GET /api/history/{seeded_id}", history_response)
                checks["GET /api/history/{id} works"] = (
                    history_response.status_code == 200 and isinstance(history, dict)
                    and isinstance(history.get("simulation_runs"), list)
                )
    except (httpx.HTTPError, RuntimeError) as exc:
        print(f"\nVerification could not complete: {exc}")

    print("\nFINAL PASS/FAIL CHECKLIST")
    for label, passed in checks.items():
        print(f"[{'x' if passed else ' '}] {label} — {'PASS' if passed else 'FAIL'}")
    return 0 if all(checks.values()) else 1


if __name__ == "__main__":
    sys.exit(main())
