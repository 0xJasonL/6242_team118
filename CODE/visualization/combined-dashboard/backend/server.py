#!/usr/bin/env python3
"""Local prediction backend for the flight delay model."""

from __future__ import annotations

import json
import os
from datetime import time as dt_time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, TransformerMixin


ROOT = Path(__file__).resolve().parent
REPO_ROOT = ROOT.parent.parent
DEFAULT_MODEL_PATH = REPO_ROOT / "datamodel" / "final_flight_pipeline.pkl"
MODEL_PATH = Path(os.environ.get("MODEL_PATH", DEFAULT_MODEL_PATH))
HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "8000"))


class TimeCyclicalEncoder(BaseEstimator, TransformerMixin):
    """Match the custom transformer used when the pipeline was trained."""

    def __init__(self, time_col):
        self.time_col = time_col

    def fit(self, X, y=None):
        return self

    def transform(self, X):
        X = X.copy()
        minutes = X[self.time_col].apply(_get_minutes)
        X["dep_time_sin"] = np.sin(2 * np.pi * minutes / 1440)
        X["dep_time_cos"] = np.cos(2 * np.pi * minutes / 1440)
        return X.drop(columns=[self.time_col])


def _get_minutes(value):
    if pd.isna(value):
        raise ValueError("FL_TIME cannot be missing.")
    if isinstance(value, dt_time):
        return value.hour * 60 + value.minute
    if isinstance(value, str):
        parsed = _parse_time(value)
        return parsed.hour * 60 + parsed.minute
    if hasattr(value, "hour") and hasattr(value, "minute"):
        return value.hour * 60 + value.minute
    raise ValueError(f"Unsupported FL_TIME value: {value!r}")


def _parse_time(value: str) -> dt_time:
    raw = value.strip()
    parts = raw.split(":")
    if len(parts) != 2:
        raise ValueError("dep_time must use HH:MM format, for example 14:30.")
    hour, minute = (int(part) for part in parts)
    if not (0 <= hour <= 23 and 0 <= minute <= 59):
        raise ValueError("dep_time must be a valid 24-hour time.")
    return dt_time(hour, minute)


def _categorise(minutes: float) -> str:
    if minutes <= 0:
        return "on_time"
    if minutes <= 30:
        return "minor"
    if minutes <= 60:
        return "moderate"
    return "severe"


def _normalise_payload(payload):
    if isinstance(payload, dict):
        payload = [payload]
    if not isinstance(payload, list) or not payload:
        raise ValueError("Request body must be a flight object or a non-empty list of flights.")

    rows = []
    required = {"month", "day_of_week", "is_weekend", "dep_time", "origin", "dest", "carrier"}

    for index, item in enumerate(payload):
        if not isinstance(item, dict):
            raise ValueError(f"Flight at index {index} must be a JSON object.")
        missing = sorted(required - set(item))
        if missing:
            raise ValueError(f"Flight at index {index} is missing fields: {', '.join(missing)}")

        rows.append(
            {
                "FL_DATE_MONTH": int(item["month"]),
                "FL_DATE_DAY": int(item["day_of_week"]),
                "IS_WEEKEND": int(item["is_weekend"]),
                "FL_TIME": _parse_time(str(item["dep_time"])),
                "ORIGIN": str(item["origin"]).upper().strip(),
                "DEST": str(item["dest"]).upper().strip(),
                "OP_CARRIER": str(item["carrier"]).upper().strip(),
            }
        )

    return pd.DataFrame(rows)


_model_cache = None


def load_model():
    global _model_cache
    if _model_cache is None:
        if not MODEL_PATH.exists():
            raise FileNotFoundError(f"Model file not found at {MODEL_PATH}")
        _model_cache = joblib.load(MODEL_PATH)
    return _model_cache


class PredictionHandler(BaseHTTPRequestHandler):
    def _send_json(self, status_code, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        return

    def do_OPTIONS(self):
        self._send_json(204, {})

    def do_GET(self):
        if self.path == "/api/health":
            model_exists = MODEL_PATH.exists()
            self._send_json(
                200,
                {
                    "status": "ok",
                    "model_path": str(MODEL_PATH),
                    "model_found": model_exists,
                },
            )
            return

        self._send_json(404, {"error": "Not found"})

    def do_POST(self):
        if self.path != "/api/predict":
            self._send_json(404, {"error": "Not found"})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length) or b"null")
            model = load_model()
            features = _normalise_payload(payload)
            predictions = model.predict(features)

            response = []
            for pred in predictions:
                delay = round(max(0.0, float(pred)), 1)
                response.append({"delay_min": delay, "category": _categorise(delay)})

            self._send_json(200, response)
        except Exception as exc:
            self._send_json(400, {"error": str(exc)})


def main():
    server = ThreadingHTTPServer((HOST, PORT), PredictionHandler)
    print(f"Prediction backend listening on http://{HOST}:{PORT}")
    print(f"Using model: {MODEL_PATH}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
