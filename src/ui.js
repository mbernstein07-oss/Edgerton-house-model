import { DEFAULT_INPUTS, runModel, sensitivitySweep } from "./model.js";
import { loadHistory, aggregateHistory, historyToInputOverrides } from "./history.js";
import { renderCostChart } from "./charts.js";
import { listScenarios, saveScenario, deleteScenario, summarizeScenario } from "./scenarios.js";
import { HELP_TITLE, HELP_HTML } from "./help.js";

const CHART_MODES = [
  {
    id: "cash",
    label: "Cash out of pocket",
    explainer:
      "Every dollar that actually leaves your pocket on each path — trip payments vs. the down payment plus all the carrying costs of owning. It doesn't yet count that the house is worth something when you sell; switch to “after resale” for that.",
  },
  {
    id: "net",
    label: "Cost after resale",
    explainer:
      "The full economic comparison: the house is credited with its resale value (appreciation + loan paydown, minus selling costs), and the Airbnb path is credited with investment growth — not only on the cash you'd have tied up in the house, but on every dollar a year you save by not carrying it, invested at your alternative-investment return. Where the lines cross is the breakeven year; a value below zero means that path has come out ahead.",
  },
];

const STATE_PARAM = "s";

const FIELD_GROUPS = [
  {
    id: "airbnb",
    badge: "A",
    tabLabel: "Airbnb",
    title: "A. Airbnb baseline (status quo)",
    fields: [
      { key: "airbnbNightlyRate", label: "Avg nightly rate", type: "range", min: 50, max: 500, step: 5, unit: "$" },
      { key: "airbnbCleaningFee", label: "Avg cleaning fee per trip", type: "range", min: 0, max: 300, step: 5, unit: "$" },
      { key: "airbnbTripsPerYear", label: "Trips per year", type: "range", min: 1, max: 12, step: 1, unit: "" },
      { key: "airbnbNightsPerTrip", label: "Avg nights per trip", type: "range", min: 1, max: 21, step: 1, unit: "nights" },
      { key: "airbnbGrowthRate", label: "Annual growth in Airbnb pricing", type: "range", min: 0, max: 10, step: 0.5, unit: "%", scale: 100 },
    ],
  },
  {
    id: "purchase",
    badge: "B",
    tabLabel: "Purchase",
    title: "B. Purchase",
    fields: [
      { key: "purchasePrice", label: "Purchase price", type: "range", min: 100000, max: 400000, step: 5000, unit: "$" },
      { key: "financing", label: "Financing", type: "toggle2", options: [["cash", "Cash"], ["mortgage", "Mortgage"]] },
      { key: "downPaymentPct", label: "Down payment", type: "range", min: 0, max: 100, step: 1, unit: "%", scale: 100, showIf: (s) => s.financing === "mortgage" },
      { key: "interestRate", label: "Interest rate", type: "range", min: 3, max: 9, step: 0.125, unit: "%", scale: 100, showIf: (s) => s.financing === "mortgage" },
      { key: "loanTermYears", label: "Loan term", type: "select", options: [[15, "15 yr"], [30, "30 yr"]], showIf: (s) => s.financing === "mortgage" },
      { key: "pmiRateAnnual", label: "PMI rate (if <20% down)", type: "range", min: 0, max: 1.5, step: 0.05, unit: "%", scale: 100, showIf: (s) => s.financing === "mortgage" },
      { key: "closingCostPct", label: "Closing costs", type: "range", min: 0, max: 5, step: 0.25, unit: "%", scale: 100 },
      { key: "furnishingCost", label: "One-time furnishing/setup cost", type: "range", min: 0, max: 40000, step: 500, unit: "$" },
    ],
  },
  {
    id: "ownership",
    badge: "C",
    tabLabel: "Ownership",
    title: "C. Ongoing ownership costs",
    fields: [
      { key: "propertyTaxRate", label: "Property tax rate (Williams County, OH)", type: "range", min: 0.5, max: 3, step: 0.05, unit: "%", scale: 100 },
      { key: "insuranceAnnual", label: "Homeowners insurance", type: "range", min: 500, max: 4000, step: 50, unit: "$/yr" },
      { key: "hoaAnnual", label: "HOA", type: "range", min: 0, max: 3000, step: 50, unit: "$/yr" },
      { key: "maintenancePct", label: "Maintenance/repairs", type: "range", min: 0, max: 3, step: 0.1, unit: "% of value/yr", scale: 100 },
      { key: "utilitiesVacantMonthly", label: "Utilities while vacant", type: "range", min: 0, max: 400, step: 10, unit: "$/mo" },
    ],
  },
  {
    id: "usage",
    badge: "D",
    tabLabel: "Usage",
    title: "D. Usage & offset",
    fields: [
      { key: "usageMode", label: "Rental usage", type: "toggle2", options: [["personal", "Personal use only"], ["rental", "Rent out when vacant"]] },
      { key: "personalNightsPerYear", label: "Nights/year you'll use it yourself (blocked from rental)", type: "range", min: 0, max: 200, step: 1, unit: "nights", showIf: (s) => s.usageMode === "rental" },
      { key: "rentalNightsPerYear", label: "Nights/year available to rent", type: "range", min: 0, max: 250, step: 5, unit: "nights", showIf: (s) => s.usageMode === "rental" },
      { key: "rentalNightlyRate", label: "Avg rental nightly rate", type: "range", min: 50, max: 500, step: 5, unit: "$", showIf: (s) => s.usageMode === "rental" },
      { key: "occupancyRate", label: "Occupancy assumption", type: "range", min: 0, max: 100, step: 5, unit: "%", scale: 100, showIf: (s) => s.usageMode === "rental" },
      { key: "propertyMgmtFeePct", label: "Property management fee", type: "range", min: 0, max: 30, step: 1, unit: "%", scale: 100, showIf: (s) => s.usageMode === "rental" },
      { key: "turnoverCostPerStay", label: "Extra turnover/cleaning cost per rented stay", type: "range", min: 0, max: 200, step: 5, unit: "$", showIf: (s) => s.usageMode === "rental" },
      { key: "platformFeePct", label: "Platform fees (Airbnb/VRBO)", type: "range", min: 0, max: 10, step: 0.5, unit: "%", scale: 100, showIf: (s) => s.usageMode === "rental" },
      { key: "tripsReplacedPct", label: "% of current Airbnb trips this replaces", type: "range", min: 0, max: 100, step: 5, unit: "%", scale: 100 },
    ],
  },
  {
    id: "financial",
    badge: "F",
    tabLabel: "Financial",
    title: "F. Financial comparison",
    fields: [
      { key: "horizonYears", label: "Time horizon to model", type: "range", min: 3, max: 20, step: 1, unit: "yrs" },
      { key: "altInvestmentReturn", label: "Alternative investment return", type: "range", min: 0, max: 12, step: 0.25, unit: "%", scale: 100 },
      { key: "homeAppreciationRate", label: "Home appreciation rate (rural Ohio)", type: "range", min: -2, max: 6, step: 0.25, unit: "%", scale: 100 },
      { key: "sellingCostPct", label: "Selling costs at exit", type: "range", min: 0, max: 12, step: 0.5, unit: "%", scale: 100 },
      { key: "marginalTaxRate", label: "Marginal tax rate", type: "range", min: 0, max: 40, step: 1, unit: "%", scale: 100 },
      { key: "itemizeDeductions", label: "Itemize deductions (mortgage interest / property tax)", type: "checkbox" },
      { key: "rentalIncomeTaxRate", label: "Rental income tax rate (Schedule E, simplified)", type: "range", min: 0, max: 40, step: 1, unit: "%", scale: 100, showIf: (s) => s.usageMode === "rental" },
    ],
  },
];

function fmtUSD(n, opts = {}) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0, ...opts });
}

function encodeState(inputs) {
  const diff = {};
  for (const key of Object.keys(inputs)) {
    if (inputs[key] !== DEFAULT_INPUTS[key]) diff[key] = inputs[key];
  }
  if (Object.keys(diff).length === 0) return "";
  return btoa(encodeURIComponent(JSON.stringify(diff)));
}

function decodeState() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get(STATE_PARAM);
  if (!raw) return {};
  try {
    return JSON.parse(decodeURIComponent(atob(raw)));
  } catch (e) {
    console.warn("Could not parse shared state from URL", e);
    return {};
  }
}

function updateUrl(inputs) {
  const encoded = encodeState(inputs);
  const url = new URL(window.location.href);
  if (encoded) url.searchParams.set(STATE_PARAM, encoded);
  else url.searchParams.delete(STATE_PARAM);
  window.history.replaceState({}, "", url);
}

// Shareable URL for an arbitrary inputs object (e.g. a saved scenario),
// independent of the page's own address bar / history state.
function shareUrlFor(inputs) {
  const encoded = encodeState(inputs);
  const url = new URL(window.location.href);
  if (encoded) url.searchParams.set(STATE_PARAM, encoded);
  else url.searchParams.delete(STATE_PARAM);
  return url.toString();
}

// All keys DEFAULT_INPUTS defines — the canonical full key set, used to
// compare two inputs objects (a saved scenario may predate a newer field).
function inputsEqual(a, b) {
  return Object.keys(DEFAULT_INPUTS).every((k) => a[k] === b[k]);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function displayValue(field, rawValue) {
  const scale = field.scale || 1;
  const shown = rawValue * scale;
  const decimals = field.step && field.step < 1 ? 2 : 0;
  const num = shown.toLocaleString(undefined, { maximumFractionDigits: decimals });
  return field.unit === "$" ? `$${num}` : field.unit === "$/yr" || field.unit === "$/mo" ? `$${num}${field.unit === "$/yr" ? "/yr" : "/mo"}` : `${num}${field.unit ? " " + field.unit : ""}`;
}

function renderField(field, state, onChange) {
  const wrap = document.createElement("div");
  wrap.className = "field";
  wrap.dataset.fieldKey = field.key;

  const labelRow = document.createElement("div");
  labelRow.className = "field-label-row";
  const label = document.createElement("label");
  label.textContent = field.label;
  labelRow.appendChild(label);

  if (field.type === "range") {
    const valueOut = document.createElement("span");
    valueOut.className = "field-value";
    valueOut.textContent = displayValue(field, state[field.key]);
    labelRow.appendChild(valueOut);
    wrap.appendChild(labelRow);

    const slider = document.createElement("input");
    slider.type = "range";
    const scale = field.scale || 1;
    slider.min = field.min;
    slider.max = field.max;
    slider.step = field.step;
    slider.value = state[field.key] * scale;

    const numberInput = document.createElement("input");
    numberInput.type = "number";
    numberInput.className = "field-number";
    numberInput.min = field.min;
    numberInput.max = field.max;
    numberInput.step = field.step;
    numberInput.value = round(state[field.key] * scale, field.step);

    const commit = (displayVal) => {
      const raw = displayVal / scale;
      // rerender:false — a slider drag / number-field keystroke must NOT rebuild
      // the form, or the element being interacted with gets destroyed mid-drag.
      onChange(field.key, raw, false);
      valueOut.textContent = displayValue(field, raw);
    };
    slider.addEventListener("input", () => {
      numberInput.value = slider.value;
      commit(Number(slider.value));
    });
    numberInput.addEventListener("input", () => {
      slider.value = numberInput.value;
      commit(Number(numberInput.value));
    });

    const row = document.createElement("div");
    row.className = "field-input-row";
    row.appendChild(slider);
    row.appendChild(numberInput);
    wrap.appendChild(row);
  } else if (field.type === "toggle2") {
    wrap.appendChild(labelRow);
    const row = document.createElement("div");
    row.className = "toggle2";
    for (const [value, text] of field.options) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = text;
      btn.className = state[field.key] === value ? "active" : "";
      btn.addEventListener("click", () => onChange(field.key, value));
      row.appendChild(btn);
    }
    wrap.appendChild(row);
  } else if (field.type === "select") {
    wrap.appendChild(labelRow);
    const select = document.createElement("select");
    for (const [value, text] of field.options) {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = text;
      if (Number(state[field.key]) === Number(value)) opt.selected = true;
      select.appendChild(opt);
    }
    select.addEventListener("change", () => onChange(field.key, Number(select.value)));
    wrap.appendChild(select);
  } else if (field.type === "checkbox") {
    const row = document.createElement("div");
    row.className = "field-checkbox-row";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = !!state[field.key];
    checkbox.addEventListener("change", () => onChange(field.key, checkbox.checked));
    row.appendChild(checkbox);
    row.appendChild(label);
    wrap.appendChild(row);
  }

  return wrap;
}

function round(n, step) {
  if (!step) return n;
  const decimals = step < 1 ? String(step).split(".")[1].length : 0;
  return Number(n.toFixed(decimals));
}

function groupHasCustomValue(group, state, baseline) {
  return group.fields.some((f) => state[f.key] !== baseline[f.key]);
}

function renderTabBar(container, tabs, activeId, onSelect) {
  container.innerHTML = "";
  container.setAttribute("role", "tablist");
  for (const tab of tabs) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tab" + (tab.id === activeId ? " active" : "");
    btn.setAttribute("role", "tab");
    btn.setAttribute("aria-selected", String(tab.id === activeId));
    btn.innerHTML = `${tab.badge ? `<span class="tab-badge">${tab.badge}</span>` : ""}${tab.label}${tab.dirty ? `<span class="tab-dot" title="Adjusted from defaults"></span>` : ""}`;
    btn.addEventListener("click", () => onSelect(tab.id));
    container.appendChild(btn);
  }
}

function renderInputFields(container, group, state, onChange) {
  container.innerHTML = "";
  const heading = document.createElement("h2");
  heading.className = "input-group-title";
  heading.textContent = group.title;
  container.appendChild(heading);

  for (const field of group.fields) {
    if (field.showIf && !field.showIf(state)) continue;
    container.appendChild(renderField(field, state, onChange));
  }
}

function renderSummary(container, result) {
  const { breakevenYear, summary, upfrontCash, inputs } = result;
  const horizon = inputs.horizonYears;
  const last = result.years[result.years.length - 1];

  const cashAirbnb = last.airbnb.cumulativeCost;
  const cashBuy = last.buy.cumulativeCashOutflow; // includes the one-time upfront cash
  const netGap = summary.buyMinusAirbnbAtHorizon; // >0 means buying costs that much more, even after resale

  // Averaged over the horizon, not a year-1 snapshot: a year-1 number doesn't
  // move at all when you change the Airbnb growth rate, appreciation, or the
  // horizon length itself (those only affect later years), which made the
  // headline look unresponsive to exactly the inputs most worth feeling.
  // Upfront cash is pulled out of the "own" average since it's a one-time
  // cost, not a recurring annual one — it's still called out separately below.
  const avgAirbnb = cashAirbnb / horizon;
  const avgOwn = (cashBuy - upfrontCash) / horizon;

  const headline = breakevenYear
    ? `Owning a ${fmtUSD(inputs.purchasePrice)} house pays off in year ${breakevenYear}`
    : `Over ${horizon} years, owning a ${fmtUSD(inputs.purchasePrice)} house never catches up to Airbnb`;

  const footnote = breakevenYear
    ? `Counting the home's resale value and investment growth, owning pulls ahead in year ${breakevenYear} and ends ${horizon} years ${fmtUSD(Math.abs(netGap))} ahead.`
    : `Even crediting the home's resale value and the investment growth on cash you didn't tie up, owning ends year ${horizon} about ${fmtUSD(Math.abs(netGap))} behind Airbnb.`;

  container.innerHTML = `
    <div class="summary-card">
      <div class="summary-headline ${breakevenYear ? "positive" : "negative"}">${headline}</div>
      <div class="summary-compare">
        <div class="compare-col">
          <div class="compare-label">Keep Airbnb-ing</div>
          <div class="compare-big">${fmtUSD(avgAirbnb)}<span>/yr avg</span></div>
          <div class="compare-sub">${fmtUSD(cashAirbnb)} total over ${horizon} yrs</div>
        </div>
        <div class="compare-vs">vs</div>
        <div class="compare-col">
          <div class="compare-label">Own the house</div>
          <div class="compare-big">${fmtUSD(avgOwn)}<span>/yr avg</span></div>
          <div class="compare-sub">+ ${fmtUSD(upfrontCash)} upfront · ${fmtUSD(cashBuy)} total over ${horizon} yrs</div>
        </div>
      </div>
      <div class="summary-footnote ${breakevenYear ? "positive" : "negative"}">${footnote}</div>
    </div>
  `;
}

function renderSensitivity(container, state, result) {
  const horizon = state.horizonYears;
  const currentGap = result.summary.buyMinusAirbnbAtHorizon;

  // Home appreciation and the alternative-investment return are always
  // relevant (appreciation drives what the house is worth if sold; the
  // alt-return drives what unspent cash would otherwise earn — including
  // for an all-cash purchase, where that's often the single biggest lever).
  // Interest rate and occupancy only apply under the toggles that use them.
  // `min` floors each swept value so a "lower" column can't stray somewhere
  // nonsensical — but home appreciation legitimately goes negative (a house can
  // lose value), so it floors well below zero rather than at zero like the rest.
  const levers = [
    { key: "homeAppreciationRate", label: "Home appreciation", scale: 100, digits: 1, deltas: [-0.01, 0, 0.01], min: -0.5 },
    { key: "altInvestmentReturn", label: "Alternative investment return", scale: 100, digits: 1, deltas: [-0.02, 0, 0.02], min: 0 },
    ...(state.financing === "mortgage" ? [{ key: "interestRate", label: "Mortgage interest rate", scale: 100, digits: 2, deltas: [-0.005, 0, 0.005], min: 0 }] : []),
    ...(state.usageMode === "rental" ? [{ key: "occupancyRate", label: "Rental occupancy", scale: 100, digits: 0, deltas: [-0.15, 0, 0.15], min: 0 }] : []),
  ];

  if (levers.length === 0) {
    container.innerHTML = `<p class="muted">No sensitivity levers available for the current toggles.</p>`;
    return;
  }

  const sweeps = levers.map((lever) => ({
    lever,
    sweep: sensitivitySweep(
      state,
      lever.key,
      lever.deltas.map((d) => Math.max(lever.min, state[lever.key] + d))
    ),
  }));

  const allNever = sweeps.every(({ sweep }) => sweep.every((s) => s.breakevenYear === null));

  const intro = result.breakevenYear
    ? `As things stand, this scenario breaks even in year ${result.breakevenYear}. Below: how that shifts if these assumptions come in higher or lower than expected instead — the shaded middle column is what you've currently got set.`
    : `As things stand, this scenario doesn't break even within ${horizon} years — it ends about ${fmtUSD(Math.abs(currentGap))} behind. Below: whether nudging these assumptions higher or lower gets it any closer — the shaded middle column is what you've currently got set.`;

  const rows = sweeps
    .map(({ lever, sweep }) => {
      const currentLabel = `${(state[lever.key] * lever.scale).toFixed(lever.digits)}%`;
      const cells = sweep
        .map((s, i) => {
          const valueLabel = `${(s.value * lever.scale).toFixed(lever.digits)}%`;
          const outcomeLabel = s.breakevenYear
            ? `breaks even yr ${s.breakevenYear}`
            : `${fmtUSD(Math.abs(s.gapAtHorizon))} behind`;
          const tag = [lever.deltas[i] === 0 ? "current" : "", s.breakevenYear ? "hits-breakeven" : ""].filter(Boolean).join(" ");
          return `<td class="${tag}">${valueLabel}<br><span class="be">${outcomeLabel}</span></td>`;
        })
        .join("");
      return `<tr><th>${lever.label}<br><span class="lever-current">now ${currentLabel}</span></th>${cells}</tr>`;
    })
    .join("");

  const note = allNever
    ? `<p class="sensitivity-note">None of these, on their own, get this scenario to break even within ${horizon} years — the gap is too large for a realistic swing in appreciation, investment returns, interest, or occupancy alone to close. The bigger levers are purchase price, financing, and whether you rent it out — those live on the Purchase and Usage tabs.</p>`
    : "";

  container.innerHTML = `
    <p class="sensitivity-intro muted">${intro}</p>
    <div class="table-scroll">
      <table class="sensitivity-table">
        <thead><tr><th>Assumption</th><th>Lower</th><th>Current</th><th>Higher</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${note}
  `;
}

function renderHistoryPanel(container, aggregate) {
  if (!aggregate || aggregate.tripCount === 0) {
    container.innerHTML = `<p class="muted">No confirmed historical trips loaded yet.</p>`;
    return;
  }
  const rows = aggregate.trips
    .map(
      (t) => `
      <tr>
        <td>${t.checkIn} → ${t.checkOut}</td>
        <td>${t.nights}</td>
        <td>${t.propertyName || ""}</td>
        <td>${fmtUSD(t.totalPricePaid)}</td>
        <td>${fmtUSD(t.totalPricePaid / t.nights)}</td>
      </tr>`
    )
    .join("");

  const unconfirmed = aggregate.unconfirmedTrips && aggregate.unconfirmedTrips.length
    ? `<p class="muted">${aggregate.unconfirmedTrips.length} other booking(s) in the area were cancelled before check-in (or never got a matching review email) — excluded from the averages above.</p>`
    : "";

  const cadence =
    aggregate.tripCount >= 3
      ? ` ≈ ${aggregate.avgTripsPerYear.toFixed(1)} trips/yr across the ${aggregate.yearsSpanned.toFixed(1)}-year span they cover.`
      : " Trips/year was left at a planning assumption — not enough history to trend it yet.";
  container.innerHTML = `
    <p class="muted">${aggregate.tripCount} confirmed trip(s) within about an hour of Edgerton back the computed defaults: avg ${fmtUSD(aggregate.avgNightlyRate)}/night, ${aggregate.avgNightsPerTrip.toFixed(1)} nights/trip,${cadence}</p>
    <table class="history-table">
      <thead><tr><th>Dates</th><th>Nights</th><th>Property</th><th>Total paid</th><th>$/night</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${unconfirmed}
  `;
}

function renderScenarioRow(scenario, { isCurrent, onLoad, onDelete, onCopyLink }) {
  const row = document.createElement("div");
  row.className = "scenario-row" + (isCurrent ? " current" : "");

  const info = document.createElement("div");
  info.className = "scenario-info";
  info.innerHTML = `
    <div class="scenario-name">${escapeHtml(scenario.name)}${isCurrent ? '<span class="scenario-current-badge">currently viewing</span>' : ""}</div>
    <div class="scenario-summary muted">${escapeHtml(summarizeScenario(scenario.inputs))}</div>
    <div class="scenario-date muted">Saved ${new Date(scenario.savedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</div>
  `;
  row.appendChild(info);

  const actions = document.createElement("div");
  actions.className = "scenario-actions";

  const loadBtn = document.createElement("button");
  loadBtn.type = "button";
  loadBtn.textContent = "Load";
  loadBtn.disabled = isCurrent;
  loadBtn.addEventListener("click", () => onLoad(scenario));
  actions.appendChild(loadBtn);

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.textContent = "Copy link";
  copyBtn.addEventListener("click", async () => {
    const ok = await onCopyLink(scenario);
    copyBtn.textContent = ok ? "Copied!" : "Copy failed";
    setTimeout(() => (copyBtn.textContent = "Copy link"), 1600);
  });
  actions.appendChild(copyBtn);

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "scenario-delete";
  deleteBtn.textContent = "Delete";
  let confirming = false;
  let revertTimer = null;
  deleteBtn.addEventListener("click", () => {
    if (!confirming) {
      confirming = true;
      deleteBtn.textContent = "Confirm delete?";
      deleteBtn.classList.add("confirm");
      revertTimer = setTimeout(() => {
        confirming = false;
        deleteBtn.textContent = "Delete";
        deleteBtn.classList.remove("confirm");
      }, 3000);
    } else {
      clearTimeout(revertTimer);
      onDelete(scenario);
    }
  });
  actions.appendChild(deleteBtn);

  row.appendChild(actions);
  return row;
}

function renderScenariosPanel(container, { scenarios, state, effectiveDefaults, onSave, onLoad, onDelete, onCopyLink }) {
  // A background input change (e.g. dragging a slider elsewhere) can trigger
  // a re-render while someone has a scenario name half-typed but not yet
  // saved — carry that text across the rebuild instead of wiping it.
  const priorName = container.querySelector(".scenario-name-input")?.value ?? "";

  container.innerHTML = "";

  const saveRow = document.createElement("div");
  saveRow.className = "scenario-save-row";
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.placeholder = 'Name this scenario, e.g. "Cash, rent when vacant"';
  nameInput.className = "scenario-name-input";
  nameInput.value = priorName;
  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.textContent = "Save current inputs";
  const doSave = () => {
    const name = nameInput.value.trim();
    if (!name) {
      nameInput.focus();
      return;
    }
    onSave(name);
    nameInput.value = "";
  };
  saveBtn.addEventListener("click", doSave);
  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doSave();
  });
  saveRow.appendChild(nameInput);
  saveRow.appendChild(saveBtn);
  container.appendChild(saveRow);

  if (scenarios.length === 0) {
    const p = document.createElement("p");
    p.className = "muted scenario-empty";
    p.textContent =
      'No saved scenarios yet. Dial in a set of inputs, name it (e.g. "Cash, personal use only" or "Mortgage, rent when vacant"), and save it here to come back to later or compare against another — each one keeps its own full copy of every input.';
    container.appendChild(p);
    return;
  }

  const list = document.createElement("div");
  list.className = "scenario-list";
  for (const scenario of scenarios) {
    const merged = { ...effectiveDefaults, ...scenario.inputs };
    const isCurrent = inputsEqual(state, merged);
    list.appendChild(renderScenarioRow(scenario, { isCurrent, onLoad, onDelete, onCopyLink }));
  }
  container.appendChild(list);
}

export async function initApp(root) {
  let historyAggregate = null;
  let historyOverrides = {};
  try {
    const historyData = await loadHistory();
    historyAggregate = aggregateHistory(historyData);
    historyOverrides = historyToInputOverrides(historyAggregate);
  } catch (e) {
    console.warn("Airbnb history unavailable, using defaults", e);
  }

  let state = { ...DEFAULT_INPUTS, ...historyOverrides, ...decodeState() };
  let activeInputTab = FIELD_GROUPS[0].id;
  let activeReferenceTab = "sensitivity";
  let chartMode = "cash";
  let scenarios = listScenarios();

  const inputTabBarEl = root.querySelector("#input-tab-bar");
  const formEl = root.querySelector("#input-form");
  const summaryEl = root.querySelector("#summary");
  const chartCanvas = root.querySelector("#net-cost-chart");
  const chartModeToggleEl = root.querySelector("#chart-mode-toggle");
  const chartExplainerEl = root.querySelector("#chart-explainer");
  const referenceTabBarEl = root.querySelector("#reference-tab-bar");
  const sensitivityEl = root.querySelector("#sensitivity");
  const historyEl = root.querySelector("#history-panel");
  const scenariosEl = root.querySelector("#scenarios-panel");
  const copyBtn = root.querySelector("#copy-link-btn");
  const resetBtn = root.querySelector("#reset-btn");
  const helpBtn = root.querySelector("#help-btn");
  const helpOverlay = root.querySelector("#help-overlay");
  const helpCloseBtn = root.querySelector("#help-close-btn");

  // "How this works" modal. Content is injected once; open/close just toggles
  // the overlay, restores focus to the trigger, and closes on Esc / backdrop.
  root.querySelector("#help-modal-title").textContent = HELP_TITLE;
  root.querySelector("#help-modal-body").innerHTML = HELP_HTML;

  function openHelp() {
    helpOverlay.hidden = false;
    helpCloseBtn.focus();
  }
  function closeHelp() {
    helpOverlay.hidden = true;
    if (helpBtn) helpBtn.focus();
  }
  if (helpBtn) helpBtn.addEventListener("click", openHelp);
  if (helpCloseBtn) helpCloseBtn.addEventListener("click", closeHelp);
  helpOverlay.addEventListener("click", (e) => {
    if (e.target === helpOverlay) closeHelp(); // backdrop click only
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !helpOverlay.hidden) closeHelp();
  });

  function renderChartModeToggle() {
    chartModeToggleEl.innerHTML = "";
    for (const m of CHART_MODES) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = m.label;
      btn.className = m.id === chartMode ? "active" : "";
      btn.addEventListener("click", () => {
        if (chartMode === m.id) return;
        chartMode = m.id;
        renderChartModeToggle();
        recompute();
      });
      chartModeToggleEl.appendChild(btn);
    }
    const active = CHART_MODES.find((m) => m.id === chartMode);
    chartExplainerEl.textContent = active ? active.explainer : "";
  }

  const effectiveDefaults = { ...DEFAULT_INPUTS, ...historyOverrides };
  let lastDirtySig = null;

  function renderInputTabBar() {
    lastDirtySig = FIELD_GROUPS.map((g) => (groupHasCustomValue(g, state, effectiveDefaults) ? "1" : "0")).join("");
    renderTabBar(
      inputTabBarEl,
      FIELD_GROUPS.map((g) => ({ id: g.id, label: g.tabLabel, badge: g.badge, dirty: groupHasCustomValue(g, state, effectiveDefaults) })),
      activeInputTab,
      (tabId) => {
        activeInputTab = tabId;
        renderInputs();
      }
    );
  }

  // Refresh only the tab bar's "adjusted" dots, and only when they actually
  // change. Called on plain value tweaks so we never touch the live field
  // element mid-interaction (that was the drag/typing bug).
  function refreshTabDots() {
    const sig = FIELD_GROUPS.map((g) => (groupHasCustomValue(g, state, effectiveDefaults) ? "1" : "0")).join("");
    if (sig !== lastDirtySig) renderInputTabBar();
  }

  // Full rebuild: used on tab switches and structural changes (toggles that
  // show/hide fields via showIf). Safe because those come from single clicks,
  // never a continuous drag.
  function renderInputs() {
    renderInputTabBar();
    const group = FIELD_GROUPS.find((g) => g.id === activeInputTab) || FIELD_GROUPS[0];
    renderInputFields(formEl, group, state, onChange);
  }

  function renderReferenceTabs() {
    const tripCount = historyAggregate ? historyAggregate.tripCount : 0;
    renderTabBar(
      referenceTabBarEl,
      [
        { id: "sensitivity", label: "Sensitivity" },
        { id: "history", label: `Trip history${tripCount ? ` (${tripCount})` : ""}` },
        { id: "scenarios", label: `Scenarios${scenarios.length ? ` (${scenarios.length})` : ""}` },
      ],
      activeReferenceTab,
      (tabId) => {
        activeReferenceTab = tabId;
        renderReferenceTabs();
      }
    );
    sensitivityEl.hidden = activeReferenceTab !== "sensitivity";
    historyEl.hidden = activeReferenceTab !== "history";
    scenariosEl.hidden = activeReferenceTab !== "scenarios";
    if (activeReferenceTab === "scenarios") renderScenarios();
  }

  async function copyToClipboard(text, onDone) {
    try {
      await navigator.clipboard.writeText(text);
      onDone(true);
    } catch (e) {
      onDone(false);
    }
  }

  function renderScenarios() {
    renderScenariosPanel(scenariosEl, {
      scenarios,
      state,
      effectiveDefaults,
      onSave: (name) => {
        saveScenario(name, state);
        scenarios = listScenarios();
        renderReferenceTabs(); // updates the "(n)" count + re-renders the list
      },
      onLoad: (scenario) => {
        state = { ...effectiveDefaults, ...scenario.inputs };
        renderInputs();
        recompute();
        renderScenarios(); // refresh "currently viewing" badges
      },
      onDelete: (scenario) => {
        deleteScenario(scenario.id);
        scenarios = listScenarios();
        renderReferenceTabs();
      },
      onCopyLink: (scenario) =>
        new Promise((resolve) => {
          copyToClipboard(shareUrlFor({ ...effectiveDefaults, ...scenario.inputs }), resolve);
        }),
    });
  }

  function recompute() {
    const result = runModel(state);
    renderSummary(summaryEl, result);
    renderCostChart(chartCanvas, result, chartMode);
    renderSensitivity(sensitivityEl, state, result);
    updateUrl(state);
  }

  // rerender=true (default): structural change (toggle/select/tab) — rebuild the
  // field list so showIf visibility updates. rerender=false: a slider/number
  // tweak — leave the live element alone, just refresh the tab dots and results.
  function onChange(key, value, rerender = true) {
    state = { ...state, [key]: value };
    if (rerender) renderInputs();
    else refreshTabDots();
    recompute();
    // Keep the "currently viewing" badge honest if that tab happens to be
    // open — cheap (small separate panel) and never touches the field the
    // user is actively dragging/typing in.
    if (activeReferenceTab === "scenarios") renderScenarios();
  }

  renderInputs();
  renderChartModeToggle();
  renderReferenceTabs();
  renderHistoryPanel(historyEl, historyAggregate);
  recompute();

  copyBtn.addEventListener("click", async () => {
    updateUrl(state);
    try {
      await navigator.clipboard.writeText(window.location.href);
      copyBtn.textContent = "Copied!";
    } catch (e) {
      copyBtn.textContent = "Copy failed — select URL manually";
    }
    setTimeout(() => (copyBtn.textContent = "Copy shareable link"), 1800);
  });

  resetBtn.addEventListener("click", () => {
    state = { ...DEFAULT_INPUTS, ...historyOverrides };
    renderInputs();
    recompute();
    if (activeReferenceTab === "scenarios") renderScenarios();
  });
}
