let cachedCarrierData  = null;
let cachedTemporalData = null;
let cachedAirportData  = null;
let cachedRouteWeights = null;

async function renderAll() {
  const carrierEl = document.getElementById("carrier-chart");
  const temporalEl = document.getElementById("temporal-chart");
  const airportEl  = document.getElementById("airport-map");

  carrierEl.innerHTML  = '<p class="loading">Loading...</p>';
  temporalEl.innerHTML = '<p class="loading">Loading...</p>';
  airportEl.innerHTML  = '<p class="loading">Loading...</p>';

  try {
    cachedCarrierData = await api.carriers();
    renderCarrierChart(cachedCarrierData);
  } catch (err) {
    carrierEl.innerHTML = `<p class="error">Failed to load carrier data: ${err.message}</p>`;
  }

  try {
    cachedTemporalData = await api.temporal();
    renderTemporalHeatmap(cachedTemporalData);
  } catch (err) {
    temporalEl.innerHTML = `<p class="error">Failed to load temporal data: ${err.message}</p>`;
  }

  try {
    [cachedAirportData, cachedRouteWeights] = await Promise.all([
      api.airports(),
      api.routeWeights(150),
    ]);
    renderAirportMap(cachedAirportData, cachedRouteWeights);
  } catch (err) {
    airportEl.innerHTML = `<p class="error">Failed to load airport/route data: ${err.message}</p>`;
  }

  initDepTimeScatter();
  initDelayCauses();
}

document.addEventListener("DOMContentLoaded", async () => {
  // Populate state dropdown
  const stateSelect = document.getElementById("state-select");
  const stateNote   = document.getElementById("state-filter-note");
  try {
    const states = await api.stateIndex();
    states.forEach((code) => {
      const opt = document.createElement("option");
      opt.value = code;
      opt.textContent = code;
      stateSelect.appendChild(opt);
    });
  } catch (_) {
    stateNote.textContent = "(state breakdown not generated — run generate_data.py first)";
    stateSelect.disabled = true;
  }

  stateSelect.addEventListener("change", () => {
    currentState = stateSelect.value || null;
    stateNote.textContent = currentState ? `Showing departures from ${currentState}` : "";
    renderAll();
  });

  // Initial render — all states
  await renderAll();

  // Re-render fixed-width charts on resize
  let resizeTimer;
  const observer = new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (cachedCarrierData)  renderCarrierChart(cachedCarrierData);
      if (cachedTemporalData) renderTemporalHeatmap(cachedTemporalData);
      redrawDelayCauses();
      // Airport map uses viewBox — scales automatically, no re-render needed
    }, 150);
  });

  observer.observe(document.querySelector("main"));
});
