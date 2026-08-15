// Chart.js rendering. Assumes the Chart.js UMD build is loaded globally (window.Chart).
// Kept separate from ui.js so the chart-specific config lives in one place.

let costChart = null;
let costChartMode = null;

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

// mode: "cash" (default) plots the raw dollars each path takes out of pocket;
// "net" plots the resale-/opportunity-cost-adjusted economic cost.
function seriesFor(result, mode) {
  if (mode === "net") {
    return {
      buy: result.years.map((r) => Math.round(r.buy.netCost)),
      airbnb: result.years.map((r) => Math.round(r.airbnb.netCost)),
      buyLabel: "Buy — cost after resale & investing",
      airbnbLabel: "Airbnb — cost after investing the difference",
      yTitle: "Net cost, lower = better (negative = ahead)",
      breakevenYear: result.breakevenYear,
    };
  }
  return {
    buy: result.years.map((r) => Math.round(r.buy.cumulativeCashOutflow)),
    airbnb: result.years.map((r) => Math.round(r.airbnb.cumulativeCost)),
    buyLabel: "Buy the house — total cash paid",
    airbnbLabel: "Keep Airbnb-ing — total cash paid",
    yTitle: "Total cash out of pocket",
    breakevenYear: null,
  };
}

export function renderCostChart(canvas, result, mode = "cash") {
  const s = seriesFor(result, mode);
  const labels = result.years.map((r) => r.year);

  const data = {
    labels,
    datasets: [
      { label: s.buyLabel, data: s.buy, borderColor: COLOR_BUY, backgroundColor: COLOR_BUY, tension: 0.15, pointRadius: 2 },
      { label: s.airbnbLabel, data: s.airbnb, borderColor: COLOR_AIRBNB, backgroundColor: COLOR_AIRBNB, tension: 0.15, pointRadius: 2 },
    ],
  };

  // Rebuild from scratch when the mode changes (axis title / breakeven line
  // differ); otherwise update in place so slider drags don't flicker.
  if (costChart && costChartMode === mode) {
    costChart.data = data;
    costChart.options.plugins.breakevenLine.year = s.breakevenYear;
    costChart.update();
    return costChart;
  }

  if (costChart) costChart.destroy();
  costChartMode = mode;
  costChart = new Chart(canvas, {
    type: "line",
    data,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { position: "bottom" },
        tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmtUSD(ctx.parsed.y)}` } },
        breakevenLine: { year: s.breakevenYear },
      },
      scales: {
        x: { title: { display: true, text: "Years from now" }, grid: { color: COLOR_GRID } },
        y: {
          title: { display: true, text: s.yTitle },
          grid: { color: COLOR_GRID },
          ticks: { callback: (v) => fmtUSD(v) },
        },
      },
    },
    plugins: [breakevenLinePlugin],
  });
  return costChart;
}
