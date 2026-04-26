#!/usr/bin/env python3
"""
generate_data.py — reads 2018 flight parquet and writes JSON data files
for the local dashboard frontend.

Usage:
    python generate_data.py
    python generate_data.py --data path/to/file.parquet --out frontend/data
"""

import argparse
import json
import math
import os
from pathlib import Path

import pandas as pd

CARRIER_NAMES = {
    "9E": "Endeavor Air",
    "AA": "American Airlines",
    "AS": "Alaska Airlines",
    "B6": "JetBlue Airways",
    "DL": "Delta Air Lines",
    "EV": "ExpressJet Airlines",
    "F9": "Frontier Airlines",
    "G4": "Allegiant Air",
    "HA": "Hawaiian Airlines",
    "MQ": "Envoy Air",
    "NK": "Spirit Airlines",
    "OH": "PSA Airlines",
    "OO": "SkyWest Airlines",
    "UA": "United Airlines",
    "VX": "Virgin America",
    "WN": "Southwest Airlines",
    "YV": "Mesa Airlines",
    "YX": "Republic Airways",
}

DEFAULT_DATA = "data/raw/2018_ht_enriched.parquet"
DEFAULT_OUT = "frontend/data"


# ── helpers ──────────────────────────────────────────────────────────────────

def _nan_safe(obj):
    """Recursively replace float NaN/Inf with None so json.dump doesn't choke."""
    if isinstance(obj, float):
        return None if (math.isnan(obj) or math.isinf(obj)) else obj
    if isinstance(obj, dict):
        return {k: _nan_safe(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_nan_safe(v) for v in obj]
    return obj


def save(data, path):
    clean = _nan_safe(data)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(clean, f, separators=(",", ":"))
    kb = os.path.getsize(path) / 1024
    print(f"  -> {path}  ({kb:.1f} KB,  {len(data) if isinstance(data, list) else len(data)} records)")


# ── data loading ─────────────────────────────────────────────────────────────

def load(path):
    print(f"Loading {path} ...")
    df = pd.read_parquet(path)
    print(f"  {len(df):,} rows, {df.shape[1]} columns")

    # Non-cancelled only for all delay metrics
    active = df[df["CANCELLED"] != 1].copy()

    # day_of_week: 1=Sun, 2=Mon, ..., 7=Sat  (matches D3 heatmap domain)
    active["day_of_week"] = (active["FL_DATE"].dt.dayofweek + 1) % 7 + 1

    # Map carrier codes to full names; fall back to code if unknown
    active["carrier_name"] = (
        active["OP_CARRIER"].map(CARRIER_NAMES).fillna(active["OP_CARRIER"])
    )

    print(f"  {len(active):,} non-cancelled flights kept")
    return active


# ── view generators ──────────────────────────────────────────────────────────

def gen_carriers(df):
    """Avg departure delay per carrier, sorted descending."""
    g = (
        df.groupby("carrier_name")["DEP_DELAY"]
        .mean()
        .round(2)
        .reset_index()
        .rename(columns={"carrier_name": "carrier", "DEP_DELAY": "avg_dep_delay"})
        .sort_values("avg_dep_delay", ascending=False)
    )
    return g.to_dict(orient="records")


def gen_temporal(df):
    """Avg departure delay by month × day-of-week (84 cells)."""
    g = (
        df.groupby(["FL_DATE_MONTH", "day_of_week"])
        .agg(avg_dep_delay=("DEP_DELAY", "mean"), total_flights=("DEP_DELAY", "count"))
        .round({"avg_dep_delay": 2})
        .reset_index()
        .rename(columns={"FL_DATE_MONTH": "month"})
    )
    g["total_flights"] = g["total_flights"].astype(int)
    return g.to_dict(orient="records")


def gen_airports(df):
    """Airport stats: traffic, departure volume, late flights, avg dep delay, coordinates."""
    # avg daily late flights: count distinct late flight numbers per (airport, date), then average
    avg_daily_late = (
        df[df["DEP_DELAY"] > 10]
        .groupby(["ORIGIN", "FL_DATE"])["FULL_FL_NUM"]
        .nunique()
        .reset_index(name="daily_late_count")
        .groupby("ORIGIN")["daily_late_count"]
        .mean()
        .round(2)
        .rename("avg_daily_late_flights")
    )
    dep = (
        df.groupby("ORIGIN")
        .agg(
            departure_volume=("FULL_FL_NUM", "count"),
            avg_dep_delay=("DEP_DELAY", "mean"),
            airport_name=("ORIGIN_NAME", "first"),
            city=("ORIGIN_MUNICIPALITY", "first"),
            latitude=("ORIGIN_LATITUDE", "first"),
            longitude=("ORIGIN_LONGITUDE", "first"),
        )
        .round({"avg_dep_delay": 2})
    )
    arr_count = df.groupby("DEST").size().rename("arr_count")
    airports = dep.join(arr_count, how="left").join(avg_daily_late, how="left")
    airports = airports.fillna({"arr_count": 0, "avg_daily_late_flights": 0})
    airports["departure_volume"] = airports["departure_volume"].astype(int)
    airports["avg_daily_flights"] = (airports["departure_volume"] / 365).round(2)
    airports["total_traffic"] = (airports["departure_volume"] + airports["arr_count"]).astype(int)
    airports = airports.reset_index().rename(columns={"ORIGIN": "airport_code"})
    return airports[
        ["airport_code", "airport_name", "city", "latitude", "longitude",
         "departure_volume", "avg_daily_flights",
         "avg_daily_late_flights",
         "total_traffic", "avg_dep_delay"]
    ].to_dict(orient="records")


def gen_airport_monthly(df):
    """Per-airport monthly departure counts + avg dep delay.
    Returns dict keyed by airport code for O(1) lookup in api.js."""
    g = (
        df.groupby(["ORIGIN", "FL_DATE_MONTH"])
        .agg(departures=("ORIGIN", "count"), avg_dep_delay=("DEP_DELAY", "mean"))
        .round({"avg_dep_delay": 2})
        .reset_index()
        .rename(columns={"FL_DATE_MONTH": "month"})
    )
    g["departures"] = g["departures"].astype(int)
    result = {}
    for airport, grp in g.groupby("ORIGIN"):
        result[airport] = grp[["month", "departures", "avg_dep_delay"]].to_dict(orient="records")
    return result


def gen_airport_top_routes(df):
    """Per-airport top-10 routes by avg departure delay (min 100 flights).
    Returns dict keyed by airport code for O(1) lookup in api.js."""
    routes = (
        df[df["DEP_DELAY"].notna()]
        .groupby(["ORIGIN", "DEST"])
        .agg(total_flights=("DEP_DELAY", "count"), avg_dep_delay=("DEP_DELAY", "mean"))
        .round({"avg_dep_delay": 2})
        .reset_index()
    )
    routes = routes[routes["total_flights"] >= 100]
    result = {}
    for airport, grp in routes.groupby("ORIGIN"):
        top = (
            grp.sort_values("avg_dep_delay", ascending=False)
            .head(10)
            .rename(columns={"DEST": "dest"})
        )
        top["total_flights"] = top["total_flights"].astype(int)
        result[airport] = top[["dest", "avg_dep_delay", "total_flights"]].to_dict(orient="records")
    return result


def gen_delay_causes(df):
    """Delay cause breakdown: volume + avg delay per cause type,
    for each (carrier, month) combo plus an 'All Carriers' aggregate."""
    cause_cols = {
        "CARRIER_DELAY":      ("avg_carrier_delay_total_delay",       "carrier_delay_total_volume"),
        "LATE_AIRCRAFT_DELAY":("avg_late_aircraft_delay_total_delay",  "late_aircraft_delay_total_volume"),
        "NAS_DELAY":          ("avg_nas_delay_total_delay",            "nas_delay_total_volume"),
        "WEATHER_DELAY":      ("avg_weather_delay_total_delay",        "weather_delay_total_volume"),
        "SECURITY_DELAY":     ("avg_security_delay_total_delay",       "security_delay_total_volume"),
    }

    rows = []

    def _compute(subdf, label):
        for month, mdf in subdf.groupby("FL_DATE_MONTH"):
            row = {"carrier": label, "month": int(month)}
            for col, (avg_key, vol_key) in cause_cols.items():
                affected = mdf.loc[mdf[col] > 0, col]
                row[vol_key] = int(len(affected))
                row[avg_key] = round(float(affected.mean()), 2) if len(affected) else 0.0
            rows.append(row)

    _compute(df, "All Carriers")
    for code, cdf in df.groupby("OP_CARRIER"):
        _compute(cdf, CARRIER_NAMES.get(code, code))

    return rows


def gen_dep_time_scatter(df, n_bins=50):
    """Cyclical encoding of scheduled departure time vs avg dep delay.
    Bins sin/cos encoded values into n_bins buckets and computes avg delay + count.
    Also produces an hourly view (0-23) for readable x-axis labels."""
    import numpy as np
    d = df[df["DEP_DELAY"].notna()].copy()
    d["dep_time_sin"] = np.sin(2 * np.pi * d["CRS_DEP_TIME_MINUTES"] / 1440)
    d["dep_time_cos"] = np.cos(2 * np.pi * d["CRS_DEP_TIME_MINUTES"] / 1440)

    def bin_col(col):
        d["_bin"] = pd.cut(d[col], bins=n_bins)
        g = (
            d.groupby("_bin", observed=True)
            .agg(x=(col, "mean"), avg_dep_delay=("DEP_DELAY", "mean"), count=("DEP_DELAY", "count"))
            .dropna()
            .round({"x": 4, "avg_dep_delay": 2})
            .reset_index(drop=True)
        )
        g["count"] = g["count"].astype(int)
        return g.to_dict(orient="records")

    # Hourly view: group by departure hour (0–23) for readable time labels
    d["dep_hour"] = (d["CRS_DEP_TIME_MINUTES"] // 60).clip(0, 23).astype(int)
    hour_g = (
        d.groupby("dep_hour")
        .agg(avg_dep_delay=("DEP_DELAY", "mean"), count=("DEP_DELAY", "count"))
        .round({"avg_dep_delay": 2})
        .reset_index()
        .rename(columns={"dep_hour": "x"})
    )
    hour_g["count"] = hour_g["count"].astype(int)

    return {
        "sin":  bin_col("dep_time_sin"),
        "cos":  bin_col("dep_time_cos"),
        "hour": hour_g.to_dict(orient="records"),
    }


def gen_route_weights(df, limit=150):
    """Top routes by departure volume (count FULL_FL_NUM), used for the route network chart."""
    vol = (
        df.groupby("ROUTE")["FULL_FL_NUM"]
        .count()
        .reset_index(name="route_weight")
        .sort_values("route_weight", ascending=False)
        .head(limit)
        .rename(columns={"ROUTE": "route"})
    )
    # avg daily late flights: count distinct late flight numbers per (route, date), then average
    avg_daily_late = (
        df[df["DEP_DELAY"] > 10]
        .groupby(["ROUTE", "FL_DATE"])["FULL_FL_NUM"]
        .nunique()
        .reset_index(name="daily_late_count")
        .groupby("ROUTE")["daily_late_count"]
        .mean()
        .round(2)
        .rename("avg_daily_late_flights")
    )
    g = vol.join(avg_daily_late, on="route", how="left").fillna({"avg_daily_late_flights": 0})
    g["route_weight"] = g["route_weight"].astype(int)
    g["avg_daily_flights"] = (g["route_weight"] / 365).round(2)
    return g.to_dict(orient="records")


def gen_state_breakdown(df, out_dir):
    """Generate per-state JSON bundles in out_dir/states/.

    Each file (e.g. TX.json) contains all chart data filtered to flights
    departing from that state: carriers, temporal, airports, route_weights,
    delay_causes, dep_time_scatter.
    """
    states_dir = Path(out_dir) / "states"
    states_dir.mkdir(parents=True, exist_ok=True)

    df = df.copy()
    df["_state"] = df["ORIGIN_ISO_REGION"].str.extract(r"US-([A-Z0-9]{2})", expand=False)
    states = sorted(df["_state"].dropna().unique())

    for state in states:
        sdf = df[df["_state"] == state].copy()
        print(f"  State {state}: {len(sdf):,} flights")
        try:
            bundle = {
                "carriers":        gen_carriers(sdf),
                "temporal":        gen_temporal(sdf),
                "airports":        gen_airports(sdf),
                "route_weights":   gen_route_weights(sdf, limit=50),
                "delay_causes":    gen_delay_causes(sdf),
                "dep_time_scatter": gen_dep_time_scatter(sdf),
            }
        except Exception as exc:
            print(f"    WARNING: skipping {state} ({exc})")
            continue
        save(bundle, states_dir / f"{state}.json")

    save(states, states_dir / "index.json")
    print(f"  Generated {len(states)} state files -> {states_dir}")


# ── main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Generate dashboard JSON data from parquet.")
    parser.add_argument("--data",          default=DEFAULT_DATA, help="Path to parquet file")
    parser.add_argument("--out",           default=DEFAULT_OUT,  help="Output directory")
    parser.add_argument("--skip-states",   action="store_true",  help="Skip per-state breakdown (faster)")
    args = parser.parse_args()

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    df = load(args.data)

    steps = [
        ("carriers.json",           lambda: gen_carriers(df)),
        ("temporal.json",           lambda: gen_temporal(df)),
        ("airports.json",           lambda: gen_airports(df)),
        ("airport_monthly.json",    lambda: gen_airport_monthly(df)),
        ("airport_top_routes.json", lambda: gen_airport_top_routes(df)),
        ("delay_causes.json",       lambda: gen_delay_causes(df)),
        ("route_weights.json",      lambda: gen_route_weights(df)),
        ("dep_time_scatter.json",   lambda: gen_dep_time_scatter(df)),
    ]

    for filename, fn in steps:
        print(f"Generating {filename} ...")
        save(fn(), out / filename)

    if not args.skip_states:
        print("\nGenerating per-state breakdowns ...")
        gen_state_breakdown(df, out)

    print("\nDone. All files written to:", out.resolve())


if __name__ == "__main__":
    main()
