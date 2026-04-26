# Prediction Backend

This folder serves the trained `final_flight_pipeline.pkl` model from `datamodel/` as a local HTTP API.

## Start

From the repository root or from this folder:

```powershell
cd combined-dashboard\backend
python -m pip install -r requirements.txt
python server.py
```

The backend starts on `http://127.0.0.1:8000`.

## Endpoints

### Health check

```http
GET /api/health
```

### Predict delay

```http
POST /api/predict
Content-Type: application/json
```

Example body:

```json
{
  "month": 12,
  "day_of_week": 2,
  "is_weekend": 0,
  "dep_time": "14:30",
  "origin": "ORD",
  "dest": "LGA",
  "carrier": "UA"
}
```

Example response:

```json
[
  {
    "delay_min": 18.4,
    "category": "minor"
  }
]
```

You can also send an array of flight objects to score multiple rows at once.
