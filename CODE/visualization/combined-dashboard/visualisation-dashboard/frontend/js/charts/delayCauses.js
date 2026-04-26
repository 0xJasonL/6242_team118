const CAUSE_KEYS = [
  { key: "avg_carrier_delay_total_delay",       volKey: "carrier_delay_total_volume",       label: "Carrier",       color: "#B90E31" },
  { key: "avg_late_aircraft_delay_total_delay", volKey: "late_aircraft_delay_total_volume", label: "Late Aircraft", color: "#D96B74" },
  { key: "avg_nas_delay_total_delay",           volKey: "nas_delay_total_volume",           label: "NAS",           color: "#F7B125" },
  { key: "avg_weather_delay_total_delay",       volKey: "weather_delay_total_volume",       label: "Weather",       color: "#52667E" },
  { key: "avg_security_delay_total_delay",      volKey: "security_delay_total_volume",      label: "Security",      color: "#001C3D" },
];

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

let delayCausesData = [];

function populateCarrierFilter(data) {
  const select = document.getElementById("delay-carrier-select");
  select.innerHTML = "";
  const carriers = [...new Set(data.map((d) => d.carrier))].sort((a, b) => {
    if (a === "All Carriers") return -1;
    if (b === "All Carriers") return 1;
    return a.localeCompare(b);
  });
  carriers.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    if (c === "All Carriers") opt.selected = true;
    select.appendChild(opt);
  });
  select.addEventListener("change", () => redrawDelayCauses());
}

function populateMonthFilter(data) {
  const select = document.getElementById("delay-month-select");
  select.innerHTML = "";
  const months = [...new Set(data.map((d) => d.month))].sort((a, b) => a - b);
  months.forEach((m) => {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = MONTHS[m - 1];
    select.appendChild(opt);
  });
  select.addEventListener("change", () => redrawDelayCauses());
}

function redrawDelayCauses() {
  const carrier = document.getElementById("delay-carrier-select").value;
  const month   = document.getElementById("delay-month-select").value;

  let filtered = delayCausesData.filter((d) => d.carrier === carrier);

  const row = filtered.find((d) => d.month === +month) || {};

  renderDelayCauses(row);
}

function renderDelayCauses(row) {
  const container = d3.select("#delay-causes-chart");
  container.selectAll("*").remove();

  const causes = CAUSE_KEYS.map((c) => ({
    ...c,
    delay:  row[c.key]    || 0,
    volume: row[c.volKey] || 0,
  }));

  const margin = { top: 20, right: 120, bottom: 20, left: 120 };
  const totalWidth = container.node().clientWidth;
  const halfW = (totalWidth - margin.left - margin.right) / 2;
  const barH = 36;
  const height = causes.length * barH;

  const svg = container.append("svg")
    .attr("width", totalWidth)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform", `translate(${margin.left + halfW},${margin.top})`);

  const xLeft  = d3.scaleLinear().domain([0, d3.max(causes, (d) => d.volume)]).range([0, halfW]).nice();
  const xRight = d3.scaleLinear().domain([0, d3.max(causes, (d) => d.delay)]).range([0, halfW]).nice();
  const y = d3.scaleBand().domain(causes.map((d) => d.label)).range([0, height]).padding(0.3);

  // Tooltip
  let tooltip = d3.select("#delay-causes-tooltip");
  if (tooltip.empty()) {
    tooltip = d3.select("body").append("div")
      .attr("id", "delay-causes-tooltip")
      .style("position", "fixed")
      .style("background", "#fff")
      .style("border", "1px solid #dde1ea")
      .style("border-radius", "6px")
      .style("padding", "8px 12px")
      .style("font-size", "12px")
      .style("color", "#222")
      .style("pointer-events", "none")
      .style("display", "none");
  }

  const showTip = (event, html) =>
    tooltip.style("display", "block")
      .style("left", event.clientX + 12 + "px")
      .style("top", event.clientY - 28 + "px")
      .html(html);

  // Center divider
  svg.append("line")
    .attr("x1", 0).attr("x2", 0)
    .attr("y1", 0).attr("y2", height)
    .attr("stroke", "#dde1ea").attr("stroke-width", 1);

  // Left bars — volume
  svg.selectAll(".bar-left")
    .data(causes)
    .join("rect")
    .attr("class", "bar-left")
    .attr("x", (d) => -xLeft(d.volume))
    .attr("y", (d) => y(d.label))
    .attr("width", (d) => xLeft(d.volume))
    .attr("height", y.bandwidth())
    .attr("fill", (d) => d.color)
    .attr("fill-opacity", 0.75)
    .attr("rx", 3)
    .on("mousemove", (event, d) =>
      showTip(event, `<strong>${d.label}</strong><br/>Affected flights: <strong>${d.volume.toLocaleString()}</strong>`))
    .on("mouseleave", () => tooltip.style("display", "none"));

  // Left value labels
  svg.selectAll(".label-left")
    .data(causes)
    .join("text")
    .attr("x", (d) => -xLeft(d.volume) - 5)
    .attr("y", (d) => y(d.label) + y.bandwidth() / 2)
    .attr("dy", "0.35em")
    .attr("text-anchor", "end")
    .attr("fill", "#aaa").attr("font-size", "11px")
    .text((d) => d.volume > 0 ? d3.format(",.0f")(d.volume) : "");

  // Right bars — avg delay
  svg.selectAll(".bar-right")
    .data(causes)
    .join("rect")
    .attr("class", "bar-right")
    .attr("x", 0)
    .attr("y", (d) => y(d.label))
    .attr("width", (d) => xRight(d.delay))
    .attr("height", y.bandwidth())
    .attr("fill", (d) => d.color)
    .attr("fill-opacity", 0.95)
    .attr("rx", 3)
    .on("mousemove", (event, d) =>
      showTip(event, `<strong>${d.label}</strong><br/>Avg delay: <strong>${d.delay} min</strong>`))
    .on("mouseleave", () => tooltip.style("display", "none"));

  // Right value labels
  svg.selectAll(".label-right")
    .data(causes)
    .join("text")
    .attr("x", (d) => xRight(d.delay) + 5)
    .attr("y", (d) => y(d.label) + y.bandwidth() / 2)
    .attr("dy", "0.35em")
    .attr("fill", "#aaa").attr("font-size", "11px")
    .text((d) => d.delay > 0 ? `${d.delay} min` : "");

  // Centre labels (cause names)
  svg.selectAll(".cause-label")
    .data(causes)
    .join("text")
    .attr("x", 0)
    .attr("y", (d) => y(d.label) + y.bandwidth() / 2)
    .attr("dy", "0.35em")
    .attr("text-anchor", "middle")
    .attr("fill", "#333").attr("font-size", "11px").attr("font-weight", "600")
    .text((d) => d.label);

  // Column headers
  svg.append("text").attr("x", -halfW / 2).attr("y", -8)
    .attr("text-anchor", "middle").attr("fill", "#666").attr("font-size", "11px")
    .text("← Affected Flights");
  svg.append("text").attr("x", halfW / 2).attr("y", -8)
    .attr("text-anchor", "middle").attr("fill", "#666").attr("font-size", "11px")
    .text("Avg Delay (min) →");
}

async function initDelayCauses() {
  const el = document.getElementById("delay-causes-chart");
  el.innerHTML = '<p class="loading">Loading...</p>';
  try {
    delayCausesData = await api.delayCauses();
    populateCarrierFilter(delayCausesData);
    populateMonthFilter(delayCausesData.filter((d) => d.carrier === "All Carriers"));
    redrawDelayCauses();
  } catch (err) {
    el.innerHTML = `<p class="error">Failed to load delay causes: ${err.message}</p>`;
  }
}
