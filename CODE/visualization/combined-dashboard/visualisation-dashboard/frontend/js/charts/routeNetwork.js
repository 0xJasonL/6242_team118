function classifyAirport(code, airportLookup, trafficThreshold) {
  const a = airportLookup.get(code);
  if (!a) return "airport";
  const isIntl = a.airport_name && a.airport_name.toLowerCase().includes("international");
  const isHub = a.total_traffic >= trafficThreshold;
  if (isHub && isIntl) return "major international hub";
  if (isHub) return "major domestic hub";
  if (isIntl) return "international airport";
  return "regional airport";
}

function renderRouteNetworkSummary(parsed, airportLookup, allAirportData) {
  const el = document.getElementById("route-network-summary");
  if (!el) return;

  const top5 = parsed.slice(0, 5);
  const minW = d3.min(top5, (d) => d.weight);
  const maxW = d3.max(top5, (d) => d.weight);
  const fmt = (n) => n.toLocaleString();

  const trafficValues = allAirportData.map((d) => d.total_traffic).sort((a, b) => a - b);
  const hubThreshold = trafficValues[Math.floor(trafficValues.length * 0.75)];

  const tags = top5.map((d) =>
    `<span class="summary-tag orange">${d.route}</span>`
  ).join("");

  const classified = top5.map((d) => {
    const [orig, dest] = d.route.split("-");
    const origType = classifyAirport(orig, airportLookup, hubThreshold);
    const destType = classifyAirport(dest, airportLookup, hubThreshold);
    return { route: d.route, weight: d.weight,
             avg_daily_flights: d.avg_daily_flights, avg_daily_late_flights: d.avg_daily_late_flights,
             orig, dest, origType, destType };
  });

  const intlCount = classified.filter((d) =>
    d.origType.includes("international") || d.destType.includes("international")
  ).length;

  const hubCount = classified.filter((d) =>
    d.origType.includes("major") && d.destType.includes("major")
  ).length;

  let patternComment = "";
  if (hubCount >= 4) patternComment = "The top routes are predominantly hub-to-hub corridors, reflecting concentrated demand between major US cities.";
  else if (intlCount >= 4) patternComment = "Most top routes involve at least one international airport, highlighting their outsized role in domestic traffic volumes.";
  else patternComment = "The top routes show a mix of hub and regional airports, suggesting demand is distributed across both major and secondary markets.";

  const typeRows = classified.map((d) =>
    `<tr>
      <td style="padding:4px 10px 4px 0;font-weight:600;color:#333;">${d.route}</td>
      <td style="padding:4px 10px 4px 0;color:#666;">${d.origType}</td>
      <td style="padding:4px 2px;color:#aaa;">→</td>
      <td style="padding:4px 0 4px 10px;color:#666;">${d.destType}</td>
      <td style="padding:4px 8px;color:#888;text-align:right;">${fmt(d.weight)} flights</td>
      <td style="padding:4px 0;color:#888;text-align:right;">${d.avg_daily_flights ?? "—"}/day</td>
      <td style="padding:4px 0 4px 8px;color:#e05c5c;text-align:right;">${d.avg_daily_late_flights ?? "—"} late/day</td>
    </tr>`
  ).join("");

  el.className = "";
  el.innerHTML = `
    <div style="background:#f8f9fc;border:1px solid #dde1ea;border-radius:8px;padding:14px 18px;font-size:12px;color:#555;line-height:1.7;">
      <div style="margin-bottom:8px;">${tags}</div>
      <p style="margin:0 0 8px;">
        The top 5 routes by flight volume range from <strong>${fmt(minW)}</strong> to
        <strong>${fmt(maxW)}</strong> flights in 2018.
      </p>
      <table style="border-collapse:collapse;margin-bottom:8px;width:auto;">
        ${typeRows}
      </table>
      <p style="margin:0;">${patternComment}</p>
    </div>
  `;
}

async function renderRouteNetwork(airportData, routeData) {
  const container = d3.select("#route-network");
  container.selectAll("*").remove();

  const width = container.node().clientWidth;
  const height = Math.round(width * 0.55);

  const svg = container.append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("width", "100%")
    .style("display", "block");

  const projection = d3.geoAlbersUsa()
    .scale(width * 1.1)
    .translate([width / 2, height / 2]);

  const path = d3.geoPath().projection(projection);

  const us = await d3.json("https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json");
  svg.append("g")
    .selectAll("path")
    .data(topojson.feature(us, us.objects.states).features)
    .join("path")
    .attr("d", path)
    .attr("fill", "#e8ecf2")
    .attr("stroke", "#b0b8c8")
    .attr("stroke-width", 0.8);

  const airportLookup = new Map(airportData.map((d) => [d.airport_code, d]));

  const parsed = routeData.map((d) => {
    const [orig, dest] = d.route.split("-");
    const o = airportLookup.get(orig);
    const de = airportLookup.get(dest);
    if (!o || !de) return null;
    const op = projection([o.longitude, o.latitude]);
    const dp = projection([de.longitude, de.latitude]);
    if (!op || !dp) return null;
    return { route: d.route, weight: d.route_weight,
             avg_daily_flights: d.avg_daily_flights, avg_daily_late_flights: d.avg_daily_late_flights,
             orig, dest, ox: op[0], oy: op[1], dx: dp[0], dy: dp[1] };
  }).filter(Boolean);

  const maxWeight = d3.max(parsed, (d) => d.weight);
  const strokeW = d3.scaleSqrt().domain([0, maxWeight]).range([0.4, 5]);
  const strokeOp = d3.scaleLinear().domain([0, maxWeight]).range([0.08, 0.65]);

  const arcGroup = svg.append("g");
  let selectedCode = "";

  let tooltip = d3.select("#route-net-tooltip");
  if (tooltip.empty()) {
    tooltip = d3.select("body").append("div")
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

  function arcPath(d) {
    const mx = (d.ox + d.dx) / 2;
    const dist = Math.hypot(d.dx - d.ox, d.dy - d.oy);
    const my = (d.oy + d.dy) / 2 - dist * 0.3;
    return `M${d.ox},${d.oy} Q${mx},${my} ${d.dx},${d.dy}`;
  }

  function drawArcs(data) {
    arcGroup.selectAll(".arc-vis, .arc-hit").remove();

    const isLinked = (d) => selectedCode && (d.orig === selectedCode || d.dest === selectedCode);

    arcGroup.selectAll(".arc-vis")
      .data(data)
      .join("path")
      .attr("class", "arc-vis")
      .attr("d", arcPath)
      .attr("fill", "none")
      .attr("stroke", (d) => isLinked(d) ? "#e05c5c" : "#3a5f8a")
      .attr("stroke-width", (d) => isLinked(d) ? Math.max(strokeW(d.weight), 2) : strokeW(d.weight))
      .attr("stroke-opacity", (d) => {
        if (!selectedCode) return strokeOp(d.weight);
        return isLinked(d) ? 0.9 : 0.05;
      })
      .attr("pointer-events", "none");

    arcGroup.selectAll(".arc-hit")
      .data(data)
      .join("path")
      .attr("class", "arc-hit")
      .attr("d", arcPath)
      .attr("fill", "none")
      .attr("stroke", "transparent")
      .attr("stroke-width", 8)
      .on("mousemove", (event, d) => {
        tooltip
          .style("display", "block")
          .style("left", event.clientX + 12 + "px")
          .style("top", event.clientY - 28 + "px")
          .html(`<strong>${d.route}</strong><br/>Departure volume: ${d.weight.toLocaleString()}<br/>Avg daily flights: ${d.avg_daily_flights ?? "—"}<br/>Avg daily late flights: ${d.avg_daily_late_flights ?? "—"}`);
      })
      .on("mouseleave", () => tooltip.style("display", "none"));
  }

  svg.append("g")
    .selectAll("circle")
    .data(airportData.filter((d) => projection([d.longitude, d.latitude])))
    .join("circle")
    .attr("cx", (d) => projection([d.longitude, d.latitude])[0])
    .attr("cy", (d) => projection([d.longitude, d.latitude])[1])
    .attr("r", 2)
    .attr("fill", "#4a6fa5")
    .attr("fill-opacity", 0.7)
    .attr("stroke", "#fff")
    .attr("stroke-width", 0.5)
    .attr("pointer-events", "none");

  renderRouteNetworkSummary(parsed, airportLookup, airportData);

  const slider = document.getElementById("route-n-slider");
  const display = document.getElementById("route-n-display");
  const label = document.getElementById("route-n-label");

  function update(n) {
    drawArcs(parsed.slice(0, n));
    if (display) display.textContent = n;
    if (label) label.textContent = n;
  }

  if (slider) {
    slider.max = parsed.length;
    slider.value = Math.min(+slider.value, parsed.length);
    slider.addEventListener("input", () => update(+slider.value));
  }

  const airportSelect = document.getElementById("route-airport-select");
  if (airportSelect) {
    airportSelect.innerHTML = '<option value="">— All airports —</option>';
    const codes = [...new Set(parsed.flatMap((d) => [d.orig, d.dest]))].sort();
    codes.forEach((code) => {
      const opt = document.createElement("option");
      opt.value = code;
      opt.textContent = code;
      airportSelect.appendChild(opt);
    });
    airportSelect.addEventListener("change", () => {
      selectedCode = airportSelect.value;
      update(slider ? +slider.value : parsed.length);
    });
  }

  update(slider ? +slider.value : parsed.length);
}
