# SIH Digital Twin - AI API Contract

## Project

Digital Twin for Well-to-Surface Optimization of Cyclic Steam Stimulation (CSS)
and Sucker Rod Pump (SRP) Operations for Heavy Oil Wells of Baghewala Field.

---

# 1. Purpose

This document defines the communication contract between:

- Frontend
- Node.js Backend
- Python AI/ML Service
- Digital Twin

The purpose is to ensure that all team members use the same:

- Endpoint names
- Request formats
- Response formats
- Parameter names
- Units
- Data meanings

---

# 2. AI Service

## Technology

Python FastAPI

## Local development URL

http://127.0.0.1:8000

## Swagger documentation

http://127.0.0.1:8000/docs

---

# 3. Important Data Disclaimer

The current prototype uses:

**Physics-informed synthetic demo data**

The dataset is NOT actual Baghewala field data.

Therefore:

- Model results are prototype results.
- Predictions are not field-validated.
- Optimization recommendations are not field-approved operating instructions.
- Actual OIL field data should replace the synthetic dataset during deployment.

The API explicitly returns:

```json
{
  "dataset_type": "physics-informed synthetic demo data",
  "field_validation": false
}