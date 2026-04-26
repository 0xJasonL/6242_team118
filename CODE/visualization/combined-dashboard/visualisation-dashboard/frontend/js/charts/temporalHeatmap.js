function renderTemporalHeatmap(data) {
  const container = d3.select("#temporal-chart");
  container.selectAll("*").remove();

  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

  const margin = { top: 20, right: 60, bottom: 50, left: 60 };
  const containerWidth = container.node().clientWidth;
  const cellW = Math.floor((containerWidth - margin.left - margin.right) / 12);
  const cellH = Math.floor(cellW * 0.45);
  const width = cellW * 12;
  const height = cellH * 7;

  const svg = container
    .append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3.scaleBand().domain(d3.range(1, 13)).range([0, width]).padding(0.06);
  const y = d3.scaleBand().domain(d3.range(1, 8)).range([0, height]).padding(0.06);

  const delays = data.map((d) => d.avg_dep_delay);
  const mean = d3.mean(delays);
  const maxDev = Math.max(Math.abs(d3.min(delays) - mean), Math.abs(d3.max(delays) - mean));

  // Centre the diverging scale on the mean so green = below-average delay, red = above-average.
  const color = d3.scaleDiverging()
    .domain([mean - maxDev, mean, mean + maxDev])
    .interpolator((t) => d3.interpolateRdYlGn(1 - t))
    .clamp(true);

  // Tooltip
  let tooltip = d3.select("#temporal-tooltip");
  if (tooltip.empty()) {
    tooltip = d3.select("body").append("div")
      .attr("id", "temporal-tooltip")
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

  // Cells
  svg.selectAll(".cell")
    .data(data)
    .join("rect")
    .attr("class", "cell")
    .attr("x", (d) => x(d.month))
    .attr("y", (d) => y(d.day_of_week))
    .attr("width", x.bandwidth())
    .attr("height", y.bandwidth())
    .attr("fill", (d) => color(d.avg_dep_delay))
    .attr("rx", 3)
    .on("mousemove", (event, d) => {
      tooltip
        .style("display", "block")
        .style("left", event.clientX + 12 + "px")
        .style("top", event.clientY - 28 + "px")
        .html(
          `<strong>${months[d.month - 1]} · ${days[d.day_of_week - 1]}</strong><br/>
           Avg dep delay: ${d.avg_dep_delay > 0 ? "+" : ""}${d.avg_dep_delay} min<br/>
           Flights: ${d.total_flights.toLocaleString()}`
        );
    })
    .on("mouseleave", () => tooltip.style("display", "none"));

  // Cell labels
  svg.selectAll(".cell-label")
    .data(data)
    .join("text")
    .attr("class", "cell-label")
    .attr("x", (d) => x(d.month) + x.bandwidth() / 2)
    .attr("y", (d) => y(d.day_of_week) + y.bandwidth() / 2)
    .attr("dy", "0.35em")
    .attr("text-anchor", "middle")
    .attr("fill", (d) => Math.abs(d.avg_dep_delay - mean) > maxDev * 0.5 ? "#fff" : "#333")
    .attr("font-size", "10px")
    .attr("pointer-events", "none")
    .text((d) => `${d.avg_dep_delay > 0 ? "+" : ""}${d.avg_dep_delay}`);

  // X axis (months)
  svg.append("g")
    .attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(x).tickFormat((d) => months[d - 1]).tickSize(0))
    .call((g) => g.select(".domain").remove())
    .selectAll("text")
    .attr("fill", "#aaa")
    .attr("font-size", "12px")
    .attr("dy", "1.2em");

  // Y axis (days)
  svg.append("g")
    .call(d3.axisLeft(y).tickFormat((d) => days[d - 1]).tickSize(0))
    .call((g) => g.select(".domain").remove())
    .selectAll("text")
    .attr("fill", "#aaa")
    .attr("font-size", "12px")
    .attr("dx", "-0.4em");

  // Colour legend
  const legendW = 160, legendH = 10;
  const legendX = width - legendW;
  const legendY = height + 38;

  const defs = svg.append("defs");
  const grad = defs.append("linearGradient").attr("id", "heatmap-legend-grad");
  grad.selectAll("stop")
    .data(d3.range(0, 1.01, 0.1))
    .join("stop")
    .attr("offset", (d) => `${d * 100}%`)
    .attr("stop-color", (d) => color(mean - maxDev + d * 2 * maxDev));

  svg.append("rect")
    .attr("x", legendX).attr("y", legendY)
    .attr("width", legendW).attr("height", legendH)
    .attr("rx", 3)
    .style("fill", "url(#heatmap-legend-grad)");

  svg.append("text").attr("x", legendX).attr("y", legendY - 3)
    .attr("fill", "#888").attr("font-size", "10px")
    .text(`${(mean - maxDev).toFixed(0)} min`);
  svg.append("text").attr("x", legendX + legendW / 2).attr("y", legendY - 3)
    .attr("fill", "#888").attr("font-size", "10px").attr("text-anchor", "middle")
    .text(`avg ${mean.toFixed(0)} min`);
  svg.append("text").attr("x", legendX + legendW).attr("y", legendY - 3)
    .attr("fill", "#888").attr("font-size", "10px").attr("text-anchor", "end")
    .text(`${(mean + maxDev).toFixed(0)} min`);
}
