# Baghewala AI/ML Experiments

This folder owns model training, leakage audits, evaluation reports, and other
offline experimentation. The production FastAPI package under `backend/app/ml/`
contains only runtime inference logic, small constants, metadata validation,
and cached model loading.

All models are trained on the physics-informed synthetic Baghewala baseline
dataset. They are prototype outputs, not field-validated engineering tools.
