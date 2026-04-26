// Set to true to load from pre-generated local JSON files (no server needed).
// Set to false to hit the live Cloud Run API.
const LOCAL_MODE = true;

const API_BASE = "https://flight-delay-api-248332894458.asia-southeast1.run.app";
const LOCAL_PREDICT_BASE = "http://127.0.0.1:8000";
const PREDICT_BASE =
  ["localhost", "127.0.0.1"].includes(window.location.hostname)
    ? LOCAL_PREDICT_BASE
    : API_BASE;

// ── state filter ──────────────────────────────────────────────────────────────
// null = all states; set to a 2-letter code (e.g. "TX") to filter all charts.
let currentState = null;

// ── local data cache ──────────────────────────────────────────────────────────
// Each file is fetched once and reused; avoids redundant network calls when
// multiple charts reference the same lookup (e.g. airport_monthly).
const _cache = {};
const _stateCache = {};

async function _local(name) {
  if (!_cache[name]) {
    const res = await fetch(`./data/${name}.json`);
    if (!res.ok) throw new Error(`Failed to load local data: ${name}.json`);
    _cache[name] = await res.json();
  }
  return _cache[name];
}

async function _stateBundle(state) {
  if (!_stateCache[state]) {
    const res = await fetch(`./data/states/${state}.json`);
    if (!res.ok) throw new Error(`No state data for: ${state}`);
    _stateCache[state] = await res.json();
  }
  return _stateCache[state];
}

async function _stateField(field) {
  const bundle = await _stateBundle(currentState);
  return bundle[field];
}

// ── remote fetch helper ───────────────────────────────────────────────────────
async function fetchJSON(path) {
  const res = await fetch(API_BASE + path);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

// ── api surface ───────────────────────────────────────────────────────────────
const api = {
  carriers: () => {
    if (!LOCAL_MODE) return fetchJSON("/api/carriers");
    return currentState ? _stateField("carriers") : _local("carriers");
  },

  temporal: () => {
    if (!LOCAL_MODE) return fetchJSON("/api/temporal");
    return currentState ? _stateField("temporal") : _local("temporal");
  },

  airports: () => {
    if (!LOCAL_MODE) return fetchJSON("/api/airports");
    return currentState ? _stateField("airports") : _local("airports");
  },

  // routes() is only used by the (skipped) route explorer; route network uses
  // routeWeights() instead. Return empty array in local mode.
  routes: (origin, dest, sort) => {
    if (LOCAL_MODE) return Promise.resolve([]);
    const p = new URLSearchParams();
    if (origin) p.set("origin", origin);
    if (dest)   p.set("dest",   dest);
    if (sort)   p.set("sort",   sort);
    return fetchJSON("/api/routes?" + p.toString());
  },

  // Lookup into pre-generated per-airport dict keyed by airport code.
  // Always uses global data (state-filtered deep-dives not supported).
  airportMonthly: async (code) => {
    if (LOCAL_MODE) {
      const data = await _local("airport_monthly");
      return data[code] || [];
    }
    return fetchJSON(`/api/airports/${code}/monthly`);
  },

  airportTopRoutes: async (code) => {
    if (LOCAL_MODE) {
      const data = await _local("airport_top_routes");
      return data[code] || [];
    }
    return fetchJSON(`/api/airports/${code}/top-routes`);
  },

  // Return all rows unfiltered; delayCauses.js filters client-side by carrier+month.
  delayCauses: (carrier, month) => {
    if (!LOCAL_MODE) {
      const p = new URLSearchParams();
      if (carrier) p.set("carrier", carrier);
      if (month)   p.set("month",   month);
      return fetchJSON("/api/delay-causes?" + p.toString());
    }
    return currentState ? _stateField("delay_causes") : _local("delay_causes");
  },

  routeWeights: async (limit) => {
    if (!LOCAL_MODE) {
      const p = new URLSearchParams();
      if (limit) p.set("limit", limit);
      return fetchJSON("/api/route-weights?" + p.toString());
    }
    const data = currentState
      ? await _stateField("route_weights")
      : await _local("route_weights");
    return limit ? data.slice(0, limit) : data;
  },

  depTimeScatter: () => {
    if (!LOCAL_MODE) return fetchJSON("/api/dep-time-scatter");
    return currentState ? _stateField("dep_time_scatter") : _local("dep_time_scatter");
  },

  stateIndex: () => _local("states/index"),

  predict: (body) =>
    fetch(PREDICT_BASE + "/api/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => r.json()),
};
