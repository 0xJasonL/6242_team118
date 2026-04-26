function renderCarrierChart(data) {
  const container = d3.select("#carrier-chart");
  container.selectAll("*").remove();

  const sorted = [...data].sort((a, b) => b.avg_dep_delay - a.avg_dep_delay);

  const margin = { top: 20, right: 60, bottom: 20, left: 160 };
  const width = container.node().clientWidth - margin.left - margin.right;
  const barHeight = 32;
  const height = sorted.length * barHeight;

  const svg = container
    .append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3
    .scaleLinear()
    .domain([0, d3.max(sorted, (d) => d.avg_dep_delay) + 2])
    .range([0, width]);

  const y = d3
    .scaleBand()
    .domain(sorted.map((d) => d.carrier))
    .range([0, height])
    .padding(0.4);

  // Bars
  svg.selectAll(".bar")
    .data(sorted)
    .join("rect")
    .attr("class", "bar")
    .attr("x", 0)
    .attr("y", (d) => y(d.carrier))
    .attr("width", (d) => x(d.avg_dep_delay))
    .attr("height", y.bandwidth())
    .attr("fill", "#e05c5c")
    .attr("rx", 3);

  // Labels
  svg.selectAll(".label")
    .data(sorted)
    .join("text")
    .attr("class", "label")
    .attr("x", (d) => x(d.avg_dep_delay) + 5)
    .attr("y", (d) => y(d.carrier) + y.bandwidth() / 2)
    .attr("dy", "0.35em")
    .attr("text-anchor", "start")
    .attr("fill", "#ccc")
    .attr("font-size", "11px")
    .text((d) => `+${d.avg_dep_delay} min`);

  // Y axis
  svg.append("g")
    .call(d3.axisLeft(y).tickSize(0))
    .call((g) => g.select(".domain").remove())
    .selectAll("text")
    .attr("fill", "#aaa")
    .attr("font-size", "12px");

  // X axis
  svg.append("g")
    .attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(x).ticks(6).tickFormat((d) => `${d} min`))
    .call((g) => g.select(".domain").remove())
    .selectAll("text")
    .attr("fill", "#888")
    .attr("font-size", "11px");
}
