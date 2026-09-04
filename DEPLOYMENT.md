# Deployment Guide

This repo is prepared for a Vercel frontend, a Render backend, and the already-hosted Supabase project.

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

In local development, the frontend falls back to `http://127.0.0.1:8000`. In production, `VITE_API_BASE_URL` must be set so the deployed site cannot silently call localhost.

## Supabase

No Supabase deployment changes are needed here. Keep using the hosted Supabase project and set the backend's `SUPABASE_URL` and `SUPABASE_KEY` in Render.

## Data and model files

The raw dataset under `backend/data/` remains gitignored and is not required for deployed inference. The trained `.joblib` model files are committed so Render can load forecasting, optimization, and risk models without retraining.

## Prototype disclaimer

This is a synthetic-data hackathon prototype, not a field-validated petroleum engineering tool. The team should decide whether the deployed site needs a visible disclaimer beyond the existing UI language before sharing it publicly or presenting to judges.
