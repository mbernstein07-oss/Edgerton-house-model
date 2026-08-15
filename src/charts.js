// Chart.js rendering. Assumes the Chart.js UMD build is loaded globally via
// CDN <script> in index.html (window.Chart). Kept separate from ui.js so the
// chart-specific config lives in one place.

let netCostChart = null;

const COLOR_BUY = "#2c5c53";
const COLOR_AIRBNB = "#a8632f";
const COLOR_GRID = "rgba(128,128,128,0.15)";

function fmtUSD(n) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

// Vertical dashed line + label at the breakeven year, drawn as a Chart.js plugin.
const breakevenLinePlugin = {
  id: "breakevenLine",
  afterDatasetsDraw(chart, _args, opts) {
    const year = opts && opts.year;
    if (year === null || year === undefined) return;
    const xScale = chart.scales.x;
    const yScale = chart.scales.y;
    const x = xScale.getPixelForValue(year);
    const ctx = chart.ctx;
    ctx.save();
    ctx.strokeStyle = "rgba(120,120,120,0.7)";
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, yScale.top);
    ctx.lineTo(x, yScale.bottom);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(120,120,120,0.9)";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`breakeven: yr ${year}`, x, yScale.top - 6);
    ctx.restore();
  },
};

export function renderNetCostChart(canvas, result) {
  const labels = result.years.map((r) => r.year);
  const buyData = result.years.map((r) => Math.round(r.buy.netCost));
  const airbnbData = result.years.map((r) => Math.round(r.airbnb.netCost));

  const config = {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Buy the house (net cost)",
          data: buyData,
          borderColor: COLOR_BUY,
          backgroundColor: COLOR_BUY,
          tension: 0.15,
          pointRadius: 2,
        },
        {
          label: "Keep doing Airbnb (net cost)",
          data: airbnbData,
          borderColor: COLOR_AIRBNB,
          backgroundColor: COLOR_AIRBNB,
          tension: 0.15,
          pointRadius: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          callbacks: {
            label(ctx) {
              return `${ctx.dataset.label}: ${fmtUSD(ctx.parsed.y)}`;
            },
          },
        },
        breakevenLine: { year: result.breakevenYear },
      },
      scales: {
        x: { title: { display: true, text: "Year" }, grid: { color: COLOR_GRID } },
        y: {
          title: { display: true, text: "Cumulative net cost (lower = better)" },
          grid: { color: COLOR_GRID },
          ticks: { callback: (v) => fmtUSD(v) },
        },
      },
    },
    plugins: [breakevenLinePlugin],
  };

  if (netCostChart) {
    netCostChart.data = config.data;
    netCostChart.options.plugins.breakevenLine.year = result.breakevenYear;
    netCostChart.update();
  } else {
    netCostChart = new Chart(canvas, config);
  }
  return netCostChart;
}
