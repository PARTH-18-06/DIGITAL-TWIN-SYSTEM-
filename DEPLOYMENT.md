# Deployment Guide

The root `vercel.json` deploys the React dashboard and FastAPI backend together using Vercel Services (currently beta). Supabase remains the hosted database. Render is an optional alternative backend host.

## Deploy the whole application on Vercel

1. Import this repository into Vercel, keeping the project Root Directory at the repository root (not `frontend/` or `backend/`). The checked-in configuration defines both services and their build settings.
2. Add `SUPABASE_URL` and `SUPABASE_KEY` as server-side environment variables. Use the values from your existing backend configuration; never prefix these with `VITE_` or commit them.
3. Leave `VITE_API_BASE_URL` unset or set it to `/`. Replace any existing Render or localhost override. Production requests use the same origin as the dashboard.
4. Deploy. `/api/*`, `/health`, and API documentation routes go to FastAPI. Other requests go to the frontend.
5. Verify `/health`, `/api/wells`, `/docs`, and `/models/well.glb` on the deployed domain, then exercise simulation, optimization, forecasting, risk, and history in the dashboard.

For CLI deployment, run these commands from the repository root:

```powershell
pnpm dlx vercel@latest login
pnpm dlx vercel@latest link
pnpm dlx vercel@latest env add SUPABASE_URL production
pnpm dlx vercel@latest env add SUPABASE_KEY production
pnpm dlx vercel@latest deploy --prod
```

Set the same variables for Preview when using preview deployments. Enter secret values only at the CLI prompts or in the Vercel dashboard.

The backend uses Python 3.13 and CPU-only XGBoost on Linux. Serialized model dependency versions are pinned. Models are included in deployment; raw training data, local environments, browser profiles, and presentation assets are excluded. Forecasting requires observations in Supabase because the local CSV development fallback is not deployed.

The Python function has a 300-second maximum duration. Confirm the actual Linux bundle fits Vercel's standard 500 MB uncompressed limit in the deployment build; local Windows tests cannot establish that. Cold starts and optimization latency still need verification on the deployed service.

References: [Vercel Services](https://vercel.com/docs/services), [Python runtime](https://vercel.com/docs/functions/runtimes/python).

## Alternative: Vercel frontend and Render backend

## Order of operations

1. Deploy the backend first on Render so you get the public API URL.
2. Deploy the frontend on Vercel with `VITE_API_BASE_URL` pointing to the Render backend URL.
3. After Vercel gives you the final frontend URL, update Render's `CORS_ORIGINS` to include that Vercel URL.
4. Redeploy/restart the Render service after changing `CORS_ORIGINS`.
5. Test the deployed app by opening the Vercel URL and checking `/health` on the Render URL.

## Backend: Render

Use `backend/` as the Render root directory, or use the included `backend/render.yaml` as the service blueprint/config reference.

Build command:

```bash
pip install -r requirements.txt
```

Start command:

```bash
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

Health check path:

```text
/health
```

Required Render environment variables:

| Variable | Example / notes |
|---|---|
| `SUPABASE_URL` | Your hosted Supabase project URL. |
| `SUPABASE_KEY` | Supabase anon/service key for the backend. Do not commit this. |
| `CORS_ORIGINS` | Comma-separated allowed frontend origins, for example `http://localhost:5173,https://your-app.vercel.app`. |

Render free-tier caveat: the service may spin down after inactivity. The first request after idle time can take roughly 30-60 seconds, so wake it up before a live judging demo.

## Frontend: Vercel

The frontend is a standard Vite app in `frontend/`. Vercel's zero-config Vite detection is sufficient; no `vercel.json` is needed.

Package manager:

```bash
pnpm
```

Build command:

```bash
pnpm run build
```

Output directory:

```text
dist
```

Required Vercel environment variable:

| Variable | Example / notes |
|---|---|
| `VITE_API_BASE_URL` | The public Render backend URL, for example `https://your-render-service.onrender.com`. |

In local development, the frontend falls back to `http://127.0.0.1:8000`. For a separate backend deployment, set `VITE_API_BASE_URL` to its public URL. For the combined Vercel deployment, leave it unset to use same-origin API requests.

## Supabase

No Supabase deployment changes are needed here. Keep using the hosted Supabase project and set the backend's `SUPABASE_URL` and `SUPABASE_KEY` in Render.

## Data and model files

The raw dataset under `backend/data/` remains gitignored and is not required for deployed inference. The trained `.joblib` model files are committed so Render can load forecasting, optimization, and risk models without retraining.

## Prototype disclaimer

This is a synthetic-data hackathon prototype, not a field-validated petroleum engineering tool. The team should decide whether the deployed site needs a visible disclaimer beyond the existing UI language before sharing it publicly or presenting to judges.
