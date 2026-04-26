let airportMapRendered = false;
let _arcGroup = null;
let _parsedRoutes = [];
let _sliderN = 150;
let _selectedCode = "";
let _strokeW, _strokeOp;


function _arcPath(d) {
  const mx   = (d.ox + d.dx) / 2;
  const dist = Math.hypot(d.dx - d.ox, d.dy - d.oy);
  const my   = (d.oy + d.dy) / 2 - dist * 0.3;
  return `M${d.ox},${d.oy} Q${mx},${my} ${d.dx},${d.dy}`;
}

function _drawArcs(n) {
  if (!_arcGroup) return;
  const data = _parsedRoutes.slice(0, n);

  const isLinked = (d) => _selectedCode && (d.orig === _selectedCode || d.dest === _selectedCode);

  _arcGroup.selectAll(".arc-vis, .arc-hit").remove();

  _arcGroup.selectAll(".arc-vis")
    .data(data)
    .join("path")
    .attr("class", "arc-vis")
    .attr("d", _arcPath)
    .attr("fill", "none")
    .attr("stroke", (d) => isLinked(d) ? "#e05c5c" : "#3a5f8a")
    .attr("stroke-width", (d) => isLinked(d) ? Math.max(_strokeW(d.weight), 2) : _strokeW(d.weight))
    .attr("stroke-opacity", (d) => {
      if (!_selectedCode) return _strokeOp(d.weight);
      return isLinked(d) ? 0.9 : 0.05;
    })
    .attr("pointer-events", "none");

  // Wider invisible hit target for tooltip
  let arcTooltip = d3.select("#route-net-tooltip");
  if (arcTooltip.empty()) {
    arcTooltip = d3.select("body").append("div")
      .attr("id", "route-net-tooltip")
      .style("position", "fixed")
      .style("background", "#fff")
      .style("border", "1px solid #dde1ea")
      .style("border-radius", "6px")
      .style("padding", "8px 12px")
      .style("font-size", "12px")
      .style("color", "#222")
      .style("pointer-events", "none")
      .style("display", "none")
      .style("z-index", "100");
  }

  _arcGroup.selectAll(".arc-hit")
    .data(data)
    .join("path")
    .attr("class", "arc-hit")
    .attr("d", _arcPath)
    .attr("fill", "none")
    .attr("stroke", "transparent")
    .attr("stroke-width", 8)
    .on("mousemove", (event, d) => {
      arcTooltip
        .style("display", "block")
        .style("left", event.clientX + 12 + "px")
        .style("top",  event.clientY - 28 + "px")
        .html(`<strong>${d.route}</strong><br/>Departure volume: ${d.weight.toLocaleString()}<br/>Avg daily flights: ${d.avg_daily_flights ?? "—"}<br/>Avg daily late flights: ${d.avg_daily_late_flights ?? "—"}`);
    })
    .on("mouseleave", () => arcTooltip.style("display", "none"));
}

// ── main chart ────────────────────────────────────────────────────────────────

async function renderAirportMap(airportData, routeData) {
  const container = d3.select("#airport-map");
  container.selectAll("*").remove();
  _arcGroup = null;
  _selectedCode = "";

  const width  = container.node().clientWidth;
  const height = Math.round(width * 0.55);

  const svg = container.append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("width", "100%")
    .style("display", "block");

  const projection = d3.geoAlbersUsa()
    .scale(width * 1.1)
    .translate([width / 2, height / 2]);

  const path = d3.geoPath().projection(projection);

  const us     = await d3.json("https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json");
  const states = topojson.feature(us, us.objects.states);

  svg.append("g")
    .selectAll("path")
    .data(states.features)
    .join("path")
    .attr("d", path)
    .attr("fill", "#e8ecf2")
    .attr("stroke", "#b0b8c8")
    .attr("stroke-width", 0.8);

  // ── parse routes ────────────────────────────────────────────────────────────
  const airportLookup = new Map(airportData.map((d) => [d.airport_code, d]));

  _parsedRoutes = (routeData || []).map((d) => {
    const [orig, dest] = d.route.split("-");
    const o  = airportLookup.get(orig);
    const de = airportLookup.get(dest);
    if (!o || !de) return null;
    const op = projection([o.longitude,  o.latitude]);
    const dp = projection([de.longitude, de.latitude]);
    if (!op || !dp) return null;
    return { route: d.route, weight: d.route_weight,
             avg_daily_flights: d.avg_daily_flights, avg_daily_late_flights: d.avg_daily_late_flights,
             orig, dest, ox: op[0], oy: op[1], dx: dp[0], dy: dp[1] };
  }).filter(Boolean);

  const maxWeight = d3.max(_parsedRoutes, (d) => d.weight);
  _strokeW  = d3.scaleSqrt().domain([0, maxWeight]).range([0.4, 5]);
  _strokeOp = d3.scaleLinear().domain([0, maxWeight]).range([0.08, 0.65]);

  // ── arc layer (behind circles) ──────────────────────────────────────────────
  _arcGroup = svg.append("g");
  _drawArcs(_sliderN);

  // ── airport circles ─────────────────────────────────────────────────────────
  const maxFlights = d3.max(airportData, (d) => d.total_traffic);
  const r = d3.scaleSqrt().domain([0, maxFlights]).range([2, 18]);

  const top5Codes = new Set(
    [...airportData].sort((a, b) => b.total_traffic - a.total_traffic)
      .slice(0, 5).map((d) => d.airport_code)
  );
  const top5DelayCodes = new Set(
    [...airportData].sort((a, b) => b.avg_dep_delay - a.avg_dep_delay)
      .slice(0, 5).map((d) => d.airport_code)
  );

  const circleColor       = (d) => top5Codes.has(d.airport_code) ? "#f5a623" : "#8a8fa8";
  const circleStroke      = (d) => top5DelayCodes.has(d.airport_code) ? "#e05c5c" : "#fff";
  const circleStrokeWidth = (d) => top5DelayCodes.has(d.airport_code) ? 3 : 0.4;

  let tooltip = d3.select("#airport-tooltip");
  if (tooltip.empty()) {
    tooltip = d3.select("body").append("div")
      .attr("id", "airport-tooltip")
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

  const visible = airportData.filter((d) => projection([d.longitude, d.latitude]));

  const circles = svg.append("g")
    .selectAll("circle")
    .data(visible)
    .join("circle")
    .attr("cx", (d) => projection([d.longitude, d.latitude])[0])
    .attr("cy", (d) => projection([d.longitude, d.latitude])[1])
    .attr("r",  (d) => r(d.total_traffic))
    .attr("fill", (d) => circleColor(d))
    .attr("fill-opacity", 0.85)
    .attr("stroke", (d) => circleStroke(d))
    .attr("stroke-width", (d) => circleStrokeWidth(d))
    .style("cursor", "pointer")
    .on("mousemove", (event, d) => {
      tooltip
        .style("display", "block")
        .style("left", event.clientX + 12 + "px")
        .style("top",  event.clientY - 28 + "px")
        .html(
          `<strong>${d.airport_code} — ${d.airport_name}</strong><br/>
           ${d.city}<br/>
           Avg dep delay: ${d.avg_dep_delay > 0 ? "+" : ""}${d.avg_dep_delay} min<br/>
           Total traffic: ${d.total_traffic.toLocaleString()}<br/>
           Avg daily flights: ${d.avg_daily_flights ?? "—"}<br/>
           Avg daily late flights: ${d.avg_daily_late_flights ?? "—"}`
        );
    })
    .on("mouseleave", () => tooltip.style("display", "none"))
    .on("click", (event, d) => {
      tooltip.style("display", "none");
      document.getElementById("airport-select").value = d.airport_code;
      document.querySelector(".airport-layout").classList.add("has-selection");

      // Reset all circles, highlight selected
      circles
        .attr("fill", (c) => circleColor(c))
        .attr("fill-opacity", 0.85)
        .attr("stroke", (c) => circleStroke(c))
        .attr("stroke-width", (c) => circleStrokeWidth(c));
      d3.select(event.currentTarget)
        .attr("fill", "#4a90e2")
        .attr("fill-opacity", 1)
        .attr("stroke", "#fff")
        .attr("stroke-width", 2);

      // Highlight routes for this airport
      _selectedCode = d.airport_code;
      _drawArcs(_sliderN);

      loadAirportDeepDive(d);
    });

  // ── dropdown ────────────────────────────────────────────────────────────────
  const select = document.getElementById("airport-select");
  const sorted = [...airportData].sort((a, b) => a.airport_code.localeCompare(b.airport_code));
  sorted.forEach((d) => {
    const opt = document.createElement("option");
    opt.value = d.airport_code;
    opt.textContent = `${d.airport_code} — ${d.airport_name}, ${d.city}`;
    select.appendChild(opt);
  });

  select.addEventListener("change", () => {
    const code    = select.value;
    if (!code) {
      _selectedCode = "";
      _drawArcs(_sliderN);
      return;
    }
    const airport = airportData.find((d) => d.airport_code === code);
    if (!airport) return;
    document.querySelector(".airport-layout").classList.add("has-selection");
    circles
      .attr("fill", (c) => circleColor(c))
      .attr("fill-opacity", 0.85)
      .attr("stroke", "#fff")
      .attr("stroke-width", 0.4);
    circles.filter((c) => c.airport_code === code)
      .attr("fill", "#4a90e2")
      .attr("fill-opacity", 1)
      .attr("stroke", "#fff")
      .attr("stroke-width", 2);
    _selectedCode = code;
    _drawArcs(_sliderN);
    loadAirportDeepDive(airport);
  });

  // ── route slider ─────────────────────────────────────────────────────────────
  const slider  = document.getElementById("route-n-slider");
  const display = document.getElementById("route-n-display");
  const label   = document.getElementById("route-n-label");
  if (slider) {
    slider.max   = _parsedRoutes.length;
    slider.value = Math.min(_sliderN, _parsedRoutes.length);
    slider.addEventListener("input", () => {
      _sliderN = +slider.value;
      if (display) display.textContent = _sliderN;
      if (label)   label.textContent   = _sliderN;
      _drawArcs(_sliderN);
    });
  }

  // ── legend ───────────────────────────────────────────────────────────────────
  const legendItems = [
    { color: "#f5a623", border: "none",              label: "Top 5 by total traffic" },
    { color: "#8a8fa8", border: "3px solid #e05c5c", label: "Top 5 by avg departure delay" },
    { color: "#8a8fa8", border: "none",              label: "Other airports" },
    { color: "#4a90e2", border: "none",              label: "Selected airport" },
    { color: "#3a5f8a", border: "none",              label: "Route arc (blue = default, red = selected airport)" },
  ];

  const legend = container.append("div")
    .style("display", "flex")
    .style("flex-wrap", "wrap")
    .style("gap", "16px")
    .style("margin-top", "10px")
    .style("padding", "8px 4px");

  legendItems.forEach(({ color, border, label }) => {
    const item = legend.append("div")
      .style("display", "flex")
      .style("align-items", "center")
      .style("gap", "6px");
    item.append("div")
      .style("width", "12px")
      .style("height", "12px")
      .style("border-radius", "50%")
      .style("background", color)
      .style("border", border)
      .style("flex-shrink", "0");
    item.append("span")
      .style("font-size", "11px")
      .style("color", "#888")
      .text(label);
  });

  // ── summaries ─────────────────────────────────────────────────────────────────
  renderAirportSummary(airportData);
  airportMapRendered = true;
}

// ── deep dive ─────────────────────────────────────────────────────────────────

async function loadAirportDeepDive(airport) {
  const panel = document.getElementById("airport-deepdive");
  panel.style.display = "block";

  document.getElementById("deepdive-title").textContent =
    `${airport.airport_code} · ${airport.airport_name} · ${airport.city}`;

  document.getElementById("monthly-chart").innerHTML   = '<p class="loading">Loading...</p>';
  document.getElementById("toproutes-chart").innerHTML = '<p class="loading">Loading...</p>';

  try {
    const [monthly, routes] = await Promise.all([
      api.airportMonthly(airport.airport_code),
      api.airportTopRoutes(airport.airport_code),
    ]);
    renderMonthlyTrend(monthly);
    renderTopRoutes(routes);
  } catch (err) {
    document.getElementById("monthly-chart").innerHTML   = `<p class="error">${err.message}</p>`;
    document.getElementById("toproutes-chart").innerHTML = "";
  }
}

function renderMonthlyTrend(data) {
  const container = d3.select("#monthly-chart");
  container.selectAll("*").remove();

  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const margin = { top: 20, right: 60, bottom: 40, left: 60 };
  const width  = container.node().clientWidth - margin.left - margin.right;
  const height = 200;

  const svg = container.append("svg")
    .attr("width",  width  + margin.left + margin.right)
    .attr("height", height + margin.top  + margin.bottom)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const x    = d3.scaleBand().domain(data.map((d) => d.month)).range([0, width]).padding(0.3);
  const yBar = d3.scaleLinear().domain([0, d3.max(data, (d) => d.departures)]).range([height, 0]).nice();
  const yLine = d3.scaleLinear()
    .domain([d3.min(data, (d) => d.avg_dep_delay) - 1, d3.max(data, (d) => d.avg_dep_delay) + 1])
    .range([height, 0]).nice();

  svg.selectAll(".bar").data(data).join("rect")
    .attr("class", "bar")
    .attr("x", (d) => x(d.month))
    .attr("y", (d) => yBar(d.departures))
    .attr("width", x.bandwidth())
    .attr("height", (d) => height - yBar(d.departures))
    .attr("fill", "#3a5f8a").attr("rx", 2);

  const line = d3.line()
    .x((d) => x(d.month) + x.bandwidth() / 2)
    .y((d) => yLine(d.avg_dep_delay))
    .curve(d3.curveMonotoneX);

  svg.append("path").datum(data)
    .attr("fill", "none").attr("stroke", "#e05c5c").attr("stroke-width", 2).attr("d", line);

  svg.selectAll(".dot").data(data).join("circle")
    .attr("cx", (d) => x(d.month) + x.bandwidth() / 2)
    .attr("cy", (d) => yLine(d.avg_dep_delay))
    .attr("r", 3).attr("fill", "#e05c5c");

  svg.append("g").attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(x).tickFormat((d) => months[d - 1]).tickSize(0))
    .call((g) => g.select(".domain").remove())
    .selectAll("text").attr("fill", "#aaa").attr("font-size", "11px").attr("dy", "1.2em");

  svg.append("g")
    .call(d3.axisLeft(yBar).ticks(4).tickFormat(d3.format("~s")))
    .call((g) => g.select(".domain").remove())
    .selectAll("text").attr("fill", "#aaa").attr("font-size", "11px");

  svg.append("g").attr("transform", `translate(${width},0)`)
    .call(d3.axisRight(yLine).ticks(4).tickFormat((d) => `${d}m`))
    .call((g) => g.select(".domain").remove())
    .selectAll("text").attr("fill", "#e05c5c").attr("font-size", "11px");

  const leg = svg.append("g").attr("transform", "translate(0,-5)");
  leg.append("rect").attr("width", 12).attr("height", 12).attr("fill", "#3a5f8a").attr("rx", 2);
  leg.append("text").attr("x", 16).attr("y", 10).attr("fill", "#aaa").attr("font-size", "11px").text("Departures");
  leg.append("line").attr("x1", 110).attr("x2", 122).attr("y1", 6).attr("y2", 6)
    .attr("stroke", "#e05c5c").attr("stroke-width", 2);
  leg.append("circle").attr("cx", 116).attr("cy", 6).attr("r", 3).attr("fill", "#e05c5c");
  leg.append("text").attr("x", 126).attr("y", 10).attr("fill", "#aaa").attr("font-size", "11px").text("Avg Dep Delay");
}

function renderTopRoutes(data) {
  const container = d3.select("#toproutes-chart");
  container.selectAll("*").remove();

  if (!data.length) {
    container.append("p").attr("class", "loading").text("No route data available.");
    return;
  }

  const margin    = { top: 10, right: 80, bottom: 20, left: 60 };
  const width     = container.node().clientWidth - margin.left - margin.right;
  const barHeight = 28;
  const height    = data.length * barHeight;

  const svg = container.append("svg")
    .attr("width",  width  + margin.left + margin.right)
    .attr("height", height + margin.top  + margin.bottom)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3.scaleLinear().domain([0, d3.max(data, (d) => d.avg_dep_delay)]).range([0, width]).nice();
  const y = d3.scaleBand().domain(data.map((d) => d.dest)).range([0, height]).padding(0.3);

  svg.selectAll(".bar").data(data).join("rect")
    .attr("class", "bar").attr("x", 0)
    .attr("y", (d) => y(d.dest))
    .attr("width", (d) => x(d.avg_dep_delay))
    .attr("height", y.bandwidth())
    .attr("fill", "#e05c5c").attr("rx", 3);

  svg.selectAll(".label").data(data).join("text")
    .attr("x", (d) => x(d.avg_dep_delay) + 5)
    .attr("y", (d) => y(d.dest) + y.bandwidth() / 2)
    .attr("dy", "0.35em").attr("fill", "#ccc").attr("font-size", "11px")
    .text((d) => `${d.avg_dep_delay > 0 ? "+" : ""}${d.avg_dep_delay} min dep · ${d.total_flights.toLocaleString()} flights`);

  svg.append("g")
    .call(d3.axisLeft(y).tickSize(0))
    .call((g) => g.select(".domain").remove())
    .selectAll("text").attr("fill", "#aaa").attr("font-size", "12px");

  svg.append("text")
    .attr("transform", "rotate(-90)").attr("x", -height / 2).attr("y", -margin.left + 12)
    .attr("text-anchor", "middle").attr("fill", "#666").attr("font-size", "11px").text("Destination");

  svg.append("g").attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(x).ticks(5).tickFormat((d) => `${d}m`))
    .call((g) => g.select(".domain").remove())
    .selectAll("text").attr("fill", "#888").attr("font-size", "11px");
}

function renderAirportSummary(data) {
  const el = document.getElementById("airport-summary");
  el.style.display = "block";
  el.innerHTML = "";
  el.className = "summary-grid";

  const byDelay = [...data].sort((a, b) => b.avg_dep_delay - a.avg_dep_delay).slice(0, 5);
  const byLate  = [...data].sort((a, b) => (b.avg_daily_late_flights ?? 0) - (a.avg_daily_late_flights ?? 0)).slice(0, 5);

  const fmt  = (n) => n >= 1000 ? `${(n / 1000).toFixed(0)}k` : n;
  const tags = (arr, cls) => arr.map((d) =>
    `<span class="summary-tag ${cls}">${d.airport_code}</span>`).join("");

  const delayMin           = d3.min(byDelay, (d) => d.avg_dep_delay);
  const delayMax           = d3.max(byDelay, (d) => d.avg_dep_delay);
  const trafficOfTop5Delay = byDelay.map((d) => d.total_traffic);
  const lateMin            = d3.min(byLate, (d) => d.avg_daily_late_flights ?? 0);
  const lateMax            = d3.max(byLate, (d) => d.avg_daily_late_flights ?? 0);

  el.innerHTML = `
    <div class="summary-box">
      <h4>Top 5 by Avg Departure Delay</h4>
      <div class="summary-airports">${tags(byDelay, "red")}</div>
      <p>
        These airports average between <strong>${delayMin.toFixed(1)} min</strong> and
        <strong>${delayMax.toFixed(1)} min</strong> of departure delay.
        Their total traffic ranges from <strong>${fmt(d3.min(trafficOfTop5Delay))}</strong> to
        <strong>${fmt(d3.max(trafficOfTop5Delay))}</strong> flights —
        most are mid-size airports, indicating that congestion alone may not be the primary driver of delays.
      </p>
    </div>
    <div class="summary-box">
      <h4>Top 5 by Avg Daily Late Flights</h4>
      <div class="summary-airports">${tags(byLate, "red")}</div>
      <p>
        These airports see between <strong>${lateMin.toFixed(1)}</strong> and
        <strong>${lateMax.toFixed(1)}</strong> late departures per day on average
        (flights with departure delay &gt; 10 min).
      </p>
    </div>`;
}
