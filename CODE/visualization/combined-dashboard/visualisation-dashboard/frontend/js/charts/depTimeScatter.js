let depTimeData = null;
let depTimeView = "hour";

async function initDepTimeScatter() {
  const el = document.getElementById("dep-time-scatter-chart");
  el.innerHTML = '<p class="loading">Loading...</p>';
  try {
    depTimeData = await api.depTimeScatter();
    // fall back to sin if hour view not yet generated
    if (!depTimeData["hour"]) depTimeView = "sin";
    renderDepTimeScatter(depTimeView);
  } catch (err) {
    el.innerHTML = `<p class="error">Failed to load data: ${err.message}</p>`;
  }
}

function _hourLabel(h) {
  if (h === 0)  return "12 AM";
  if (h === 12) return "12 PM";
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

function renderDepTimeScatter(view) {
  const container = d3.select("#dep-time-scatter-chart");
  container.selectAll("*").remove();

  const data = depTimeData[view];

  // Toggle buttons
  const controls = container.append("div")
    .style("display", "flex")
    .style("gap", "8px")
    .style("margin-bottom", "12px");

  const btnLabels = { hour: "By Hour", sin: "sin(time)", cos: "cos(time)" };
  const views = depTimeData["hour"] ? ["hour", "sin", "cos"] : ["sin", "cos"];

  views.forEach((v) => {
    controls.append("button")
      .text(btnLabels[v])
      .style("padding", "4px 14px")
      .style("font-size", "12px")
      .style("border-radius", "4px")
      .style("border", "1px solid #3a5f8a")
      .style("background", v === view ? "#3a5f8a" : "transparent")
      .style("color", v === view ? "#fff" : "#3a5f8a")
      .style("cursor", "pointer")
      .on("click", () => {
        depTimeView = v;
        renderDepTimeScatter(v);
      });
  });

  const isHour = view === "hour";
  const margin = { top: 20, right: 40, bottom: 50, left: 60 };
  const width  = container.node().clientWidth - margin.left - margin.right;
  const height = 300;

  const svg = container.append("svg")
    .attr("width",  width  + margin.left + margin.right)
    .attr("height", height + margin.top  + margin.bottom)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const x = isHour
    ? d3.scaleLinear().domain([0, 23]).range([0, width])
    : d3.scaleLinear().domain([-1, 1]).range([0, width]);

  const y = d3.scaleLinear()
    .domain([0, d3.max(data, (d) => d.avg_dep_delay) + 2])
    .range([height, 0]).nice();

  const maxCount = d3.max(data, (d) => d.count);
  const r = d3.scaleSqrt().domain([0, maxCount]).range([3, 14]);

  // Gridlines
  svg.append("g")
    .attr("class", "grid")
    .call(d3.axisLeft(y).ticks(5).tickSize(-width).tickFormat(""))
    .call((g) => g.select(".domain").remove())
    .selectAll("line")
    .attr("stroke", "#2a2e3a")
    .attr("stroke-dasharray", "3,3");

  // Zero line (sin/cos only)
  if (!isHour) {
    svg.append("line")
      .attr("x1", x(0)).attr("x2", x(0))
      .attr("y1", 0).attr("y2", height)
      .attr("stroke", "#555").attr("stroke-dasharray", "4,3");
  }

  // Tooltip
  let tooltip = d3.select("#dep-time-tooltip");
  if (tooltip.empty()) {
    tooltip = d3.select("body").append("div")
      .attr("id", "dep-time-tooltip")
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

  // Dots
  svg.selectAll(".dot")
    .data(data)
    .join("circle")
    .attr("class", "dot")
    .attr("cx", (d) => x(d.x))
    .attr("cy", (d) => y(d.avg_dep_delay))
    .attr("r",  (d) => r(d.count))
    .attr("fill", "#3a5f8a")
    .attr("fill-opacity", 0.7)
    .attr("stroke", "#5a8fc0")
    .attr("stroke-width", 1)
    .on("mousemove", (event, d) => {
      const label = isHour ? _hourLabel(d.x) : `${view}(time) = ${d.x}`;
      tooltip
        .style("display", "block")
        .style("left", event.clientX + 12 + "px")
        .style("top",  event.clientY - 28 + "px")
        .html(
          `<strong>${label}</strong><br/>
           Avg dep delay: +${d.avg_dep_delay} min<br/>
           Flights: ${d.count.toLocaleString()}`
        );
    })
    .on("mouseleave", () => tooltip.style("display", "none"));

  // Trend line
  const sorted = [...data].sort((a, b) => a.x - b.x);
  const line = d3.line()
    .x((d) => x(d.x))
    .y((d) => y(d.avg_dep_delay))
    .curve(d3.curveCatmullRom.alpha(0.5));

  svg.append("path")
    .datum(sorted)
    .attr("fill", "none")
    .attr("stroke", "#e05c5c")
    .attr("stroke-width", 1.5)
    .attr("stroke-opacity", 0.8)
    .attr("d", line);

  // X axis
  const xAxisFn = isHour
    ? d3.axisBottom(x)
        .tickValues([0, 3, 6, 9, 12, 15, 18, 21, 23])
        .tickFormat(_hourLabel)
    : d3.axisBottom(x).ticks(9).tickFormat(d3.format(".1f"));

  svg.append("g")
    .attr("transform", `translate(0,${height})`)
    .call(xAxisFn)
    .call((g) => g.select(".domain").remove())
    .selectAll("text")
    .attr("fill", "#888")
    .attr("font-size", "11px")
    .attr("transform", isHour ? "rotate(-35)" : null)
    .style("text-anchor", isHour ? "end" : "middle");

  // X axis label
  const xLabel = isHour
    ? "Scheduled Departure Time"
    : view === "sin" ? "sin(2π · dep_time / 1440)" : "cos(2π · dep_time / 1440)";

  svg.append("text")
    .attr("x", width / 2).attr("y", height + 48)
    .attr("text-anchor", "middle")
    .attr("fill", "#666").attr("font-size", "11px")
    .text(xLabel);

  // Y axis
  svg.append("g")
    .call(d3.axisLeft(y).ticks(5).tickFormat((d) => `${d}m`))
    .call((g) => g.select(".domain").remove())
    .selectAll("text").attr("fill", "#888").attr("font-size", "11px");

  // Y axis label
  svg.append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -height / 2).attr("y", -48)
    .attr("text-anchor", "middle")
    .attr("fill", "#666").attr("font-size", "11px")
    .text("Avg Dep Delay (min)");
}
