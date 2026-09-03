# Baghewala Digital Twin Frontend

React + TypeScript dashboard for the hackathon simulation API. The interface is explicitly labeled as synthetic demo data and is not intended for field operations. The Three.js digital twin is deliberately represented by an empty integration slot.

## Run locally

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

Open `http://localhost:5173`. The FastAPI backend must be running separately on port 8000 with Supabase configured and seeded.

## Backend URL

The default is `http://localhost:8000`. To use another API, create `.env` and set:

```dotenv
VITE_API_BASE_URL=https://your-api.example.com
```

Restart the Vite development server after changing environment variables.

## Production build

```powershell
npm run build
```
