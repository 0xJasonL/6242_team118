#!/usr/bin/env python3
"""
run.py — one-command local dashboard launcher.

Steps:
  1. Generates JSON data files from the parquet (skipped if already up to date).
  2. Starts a local HTTP server serving the frontend/ directory.
  3. Opens the dashboard in the default browser.

Usage:
    python run.py
    python run.py --data path/to/2018_ht_enriched.parquet --port 8080 --no-browser
    python run.py --regenerate   # force re-generate data files even if they exist
"""

import argparse
import json as _json
import os
import subprocess
import sys
import threading
import time
import webbrowser
from datetime import time as dt_time
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

ROOT = Path(__file__).parent
DATA_DIR = ROOT / "frontend" / "data"
PARQUET_DEFAULT = ROOT / "data" / "raw" / "2018_ht_enriched.parquet"
MODEL_PATH = ROOT.parent / "model" / "final_flight_pipeline.pkl"

# TimeCyclicalEncoder must be defined at module level so joblib can find it
# when unpickling the pipeline (pickle stores the class by qualified name).
try:
    from sklearn.base import BaseEstimator, TransformerMixin as _TM
    import numpy as _np

    class TimeCyclicalEncoder(BaseEstimator, _TM):
        def __init__(self, time_col):
            self.time_col = time_col
        def fit(self, X, y=None):
            return self
        def transform(self, X):
            X = X.copy()
            minutes = X[self.time_col].apply(lambda t: t.hour * 60 + t.minute)
            X["dep_time_sin"] = _np.sin(2 * _np.pi * minutes / 1440)
            X["dep_time_cos"] = _np.cos(2 * _np.pi * minutes / 1440)
            return X.drop(columns=[self.time_col])

    import sklearn.base as _skbase
    _skbase.TimeCyclicalEncoder = TimeCyclicalEncoder
except ImportError:
    pass  # sklearn not installed; prediction endpoint will fail gracefully

_model_cache = None

def _load_model():
    global _model_cache
    if _model_cache is None:
        import joblib
        _model_cache = joblib.load(MODEL_PATH)
        print(f"Model loaded from {MODEL_PATH}")
    return _model_cache

GENERATED_FILES = [
    "carriers.json",
    "temporal.json",
    "airports.json",
    "airport_monthly.json",
    "airport_top_routes.json",
    "delay_causes.json",
    "route_weights.json",
    "dep_time_scatter.json",
]


def data_is_fresh():
    """Return True if all JSON files exist and are newer than generate_data.py."""
    script = ROOT / "generate_data.py"
    for f in GENERATED_FILES:
        path = DATA_DIR / f
        if not path.exists():
            return False
        if path.stat().st_mtime < script.stat().st_mtime:
            return False
    return True


def generate(data_path):
    print("=" * 60)
    print("Generating data files from parquet...")
    print("=" * 60)
    result = subprocess.run(
        [sys.executable, str(ROOT / "generate_data.py"), "--data", str(data_path)],
        cwd=ROOT,
    )
    if result.returncode != 0:
        print("\nERROR: generate_data.py failed. Aborting.")
        sys.exit(1)


DELAY_CATEGORIES = [
    (0,  "on_time"),
    (30, "minor"),
    (60, "moderate"),
    (float("inf"), "severe"),
]

def _categorise(minutes):
    for threshold, label in DELAY_CATEGORIES:
        if minutes <= threshold:
            return label
    return "severe"


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self):
        if self.path != "/api/predict":
            self.send_response(404)
            self.end_headers()
            return
        try:
            import pandas as pd
            length = int(self.headers.get("Content-Length", 0))
            body = _json.loads(self.rfile.read(length))
            model = _load_model()

            rows = []
            for f in body:
                h, m = map(int, f["dep_time"].split(":"))
                rows.append({
                    "FL_DATE_MONTH": int(f["month"]),
                    "FL_DATE_DAY":   int(f["day_of_week"]),
                    "IS_WEEKEND":    int(f["is_weekend"]),
                    "FL_TIME":       dt_time(h, m),
                    "ORIGIN":        f["origin"].upper(),
                    "DEST":          f["dest"].upper(),
                    "OP_CARRIER":    f["carrier"].upper(),
                })

            preds = model.predict(pd.DataFrame(rows))
            results = []
            for pred in preds:
                delay = round(max(0.0, float(pred)), 1)
                results.append({"delay_min": delay, "category": _categorise(delay)})

            payload = _json.dumps(results).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(payload)

        except Exception as exc:
            err = _json.dumps({"error": str(exc)}).encode()
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(err)


def serve(port):
    server = HTTPServer(("localhost", port), QuietHandler)
    server.serve_forever()


def main():
    parser = argparse.ArgumentParser(description="Run the flight delay dashboard locally.")
    parser.add_argument("--data",        default=str(PARQUET_DEFAULT), help="Path to parquet file")
    parser.add_argument("--port",        default=8080, type=int,        help="HTTP port (default: 8080)")
    parser.add_argument("--no-browser",  action="store_true",            help="Don't open browser automatically")
    parser.add_argument("--regenerate",  action="store_true",            help="Force re-generate data files")
    parser.add_argument("--serve-only",  action="store_true",            help="Skip data generation and serve existing files")
    args = parser.parse_args()

    # Step 1: generate data if needed
    if args.serve_only:
        print("Skipping data generation (--serve-only).")
    elif args.regenerate or not data_is_fresh():
        generate(args.data)
    else:
        print("Data files are up to date. Skipping generation (use --regenerate to force).")

    # Step 2: start HTTP server from combined-dashboard root so absolute paths resolve
    serve_dir = (ROOT.parent).resolve()  # combined-dashboard/
    print(f"Serving from: {serve_dir}")
    os.chdir(serve_dir)
    t = threading.Thread(target=serve, args=(args.port,), daemon=True)
    t.start()

    url = f"http://localhost:{args.port}/visualisation-dashboard/frontend/index.html"
    print(f"\nDashboard running at: {url}")
    print("Press Ctrl+C to stop.\n")

    # Step 3: open browser
    if not args.no_browser:
        time.sleep(0.5)
        webbrowser.open(url)

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
