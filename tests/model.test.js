// Plain-Node sanity checks, no test framework/build step required.
// Run with: node tests/model.test.js  (or: npm test)

import assert from "node:assert/strict";
import {
  DEFAULT_INPUTS,
  monthlyMortgagePayment,
  amortizationYearly,
  airbnbAnnualCost,
  runModel,
  sensitivitySweep,
} from "../src/model.js";

let passed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (err) {
    failures.push({ name, err });
  }
}

// --- monthlyMortgagePayment -------------------------------------------------

test("monthlyMortgagePayment matches known amortization value", () => {
  // $200,000 @ 6% / 30yr should be ~$1,199.10/mo (standard textbook figure)
  const payment = monthlyMortgagePayment(200000, 0.06, 30);
  assert.ok(Math.abs(payment - 1199.1) < 1, `expected ~1199.10, got ${payment}`);
});

test("monthlyMortgagePayment is 0 for a 0 loan amount", () => {
  assert.equal(monthlyMortgagePayment(0, 0.06, 30), 0);
});

test("monthlyMortgagePayment handles a 0% interest rate (straight-line)", () => {
  const payment = monthlyMortgagePayment(120000, 0, 10);
  assert.ok(Math.abs(payment - 1000) < 0.01, `expected 1000, got ${payment}`);
});

// --- amortizationYearly ------------------------------------------------------

test("amortizationYearly: interest + principal equals total payment each year", () => {
  const years = amortizationYearly(200000, 0.06, 30, 250000, 0, 30);
  for (const y of years) {
    assert.ok(Math.abs(y.interestPaid + y.principalPaid - y.paymentTotal) < 0.01, `year ${y.year} mismatch`);
  }
});

test("amortizationYearly: loan balance is fully paid off by end of term", () => {
  const years = amortizationYearly(200000, 0.06, 30, 250000, 0, 30);
  const last = years[years.length - 1];
  assert.ok(last.endingBalance < 1, `expected ~0 balance, got ${last.endingBalance}`);
});

test("amortizationYearly: balance decreases monotonically", () => {
  const years = amortizationYearly(200000, 0.06, 30, 250000, 0, 30);
  let prev = 200000;
  for (const y of years) {
    assert.ok(y.endingBalance <= prev + 0.01, `balance rose in year ${y.year}`);
    prev = y.endingBalance;
  }
});

test("amortizationYearly: no further payments once loan term ends but horizon continues", () => {
  const years = amortizationYearly(50000, 0.06, 5, 100000, 0, 8);
  assert.equal(years.length, 8);
  assert.equal(years[6].paymentTotal, 0);
  assert.equal(years[7].endingBalance, 0);
});

test("amortizationYearly: PMI charged while balance above 78% LTV, then stops", () => {
  // Small down payment so PMI persists for a while, then must hit 0.
  const years = amortizationYearly(240000, 0.065, 30, 250000, 0.005, 30);
  assert.ok(years[0].pmiPaid > 0, "expected PMI in year 1");
  const lastYear = years[years.length - 1];
  assert.equal(lastYear.pmiPaid, 0, "PMI should be gone once loan is paid off");
});

// --- airbnbAnnualCost ---------------------------------------------------------

test("airbnbAnnualCost: year 1 matches nightly rate * nights * trips + cleaning*trips", () => {
  const inputs = { ...DEFAULT_INPUTS, airbnbNightlyRate: 200, airbnbNightsPerTrip: 5, airbnbTripsPerYear: 3, airbnbCleaningFee: 50, airbnbGrowthRate: 0.05 };
  const cost = airbnbAnnualCost(inputs, 1);
  const expected = 3 * (200 * 5 + 50);
  assert.ok(Math.abs(cost - expected) < 0.01, `expected ${expected}, got ${cost}`);
});

test("airbnbAnnualCost: compounds with growth rate in later years", () => {
  const inputs = { ...DEFAULT_INPUTS, airbnbGrowthRate: 0.1 };
  const year1 = airbnbAnnualCost(inputs, 1);
  const year3 = airbnbAnnualCost(inputs, 3);
  assert.ok(Math.abs(year3 - year1 * Math.pow(1.1, 2)) < 0.01);
});

// --- runModel: cash vs. mortgage ---------------------------------------------

test("runModel: cash purchase has no mortgage payment or loan balance", () => {
  const result = runModel({ ...DEFAULT_INPUTS, financing: "cash" });
  for (const row of result.years) {
    if (row.year === 0) continue;
    assert.equal(row.buy.mortgagePayment, 0);
    assert.equal(row.buy.loanBalance, 0);
  }
  assert.equal(result.loanAmount, 0);
});

test("runModel: mortgage purchase carries a loan balance that amortizes down", () => {
  const result = runModel({ ...DEFAULT_INPUTS, financing: "mortgage", downPaymentPct: 0.2 });
  const y1 = result.years.find((r) => r.year === 1);
  const yLast = result.years[result.years.length - 1];
  assert.ok(y1.buy.mortgagePayment > 0);
  assert.ok(yLast.buy.loanBalance < result.loanAmount);
});

test("runModel: upfront cash equals down payment + closing + furnishing", () => {
  const inputs = { ...DEFAULT_INPUTS, purchasePrice: 200000, downPaymentPct: 0.2, closingCostPct: 0.03, furnishingCost: 10000, financing: "mortgage" };
  const result = runModel(inputs);
  const expected = 200000 * 0.2 + 200000 * 0.03 + 10000;
  assert.ok(Math.abs(result.upfrontCash - expected) < 0.01);
});

// --- runModel: breakeven sanity ------------------------------------------------

test("runModel: cheap mortgaged house vs. very expensive frequent Airbnb trips breaks even", () => {
  // Against a genuinely expensive Airbnb pattern (lots of pricey trips), a cheap
  // mortgaged house is far cheaper per year — so owning both builds equity and
  // banks the yearly savings, and it breaks even within the horizon.
  const result = runModel({
    ...DEFAULT_INPUTS,
    financing: "mortgage",
    purchasePrice: 120000,
    downPaymentPct: 0.2,
    closingCostPct: 0.02,
    furnishingCost: 5000,
    airbnbNightlyRate: 400,
    airbnbTripsPerYear: 6,
    airbnbNightsPerTrip: 7,
    homeAppreciationRate: 0.03,
    horizonYears: 15,
  });
  assert.ok(result.breakevenYear !== null, "expected a breakeven year");
});

test("runModel: an all-cash purchase at a modest travel level never catches up to Airbnb", () => {
  // The full purchase price sits tied up (earning only appreciation), while the
  // Airbnb-er invests that same capital AND the yearly housing-cost savings at
  // the alt-investment return. At a modest personal-use level, owning can't
  // close that opportunity-cost gap within the horizon.
  const cash = runModel({ ...DEFAULT_INPUTS, financing: "cash", purchasePrice: 200000, horizonYears: 15 });
  assert.equal(cash.breakevenYear, null, "expected no breakeven for an all-cash buy at a modest travel level");
});

test("runModel: opportunity cost is complete — the Airbnb side fund invests the annual housing-cost savings, not just the upfront lump", () => {
  const result = runModel(DEFAULT_INPUTS);
  const last = result.years[result.years.length - 1];
  // If only the upfront lump were invested, the side fund would equal
  // upfront * (1+r)^N. Because owning costs far more per year than this modest
  // Airbnb habit, the Airbnb-er banks the yearly difference too, so the fund
  // must exceed that upfront-only figure by a wide margin.
  const upfrontOnly = result.upfrontCash * Math.pow(1 + DEFAULT_INPUTS.altInvestmentReturn, DEFAULT_INPUTS.horizonYears);
  assert.ok(last.airbnb.sideFund > upfrontOnly * 1.5, `expected side fund (${Math.round(last.airbnb.sideFund)}) to far exceed upfront-only (${Math.round(upfrontOnly)})`);
});

test("runModel: a 0%-occupancy rental year charges no cleaning fees (no phantom turnovers)", () => {
  const rented = runModel({ ...DEFAULT_INPUTS, usageMode: "rental", occupancyRate: 0, rentalNightsPerYear: 60, turnoverCostPerStay: 75 });
  assert.equal(rented.years[1].buy.rentalIncomeNet, 0, "0% occupancy should net exactly 0, not a negative cleaning charge");
});

test("runModel: personal-use nights cap rental availability (you can't rent nights you occupy)", () => {
  const base = { ...DEFAULT_INPUTS, usageMode: "rental", rentalNightsPerYear: 250, occupancyRate: 1, rentalNightlyRate: 100, propertyMgmtFeePct: 0, platformFeePct: 0, turnoverCostPerStay: 0, airbnbGrowthRate: 0, personalNightsPerYear: 0 };
  const noPersonal = runModel(base).years[1].buy.rentalIncomeNet;
  const heavyPersonal = runModel({ ...base, personalNightsPerYear: 200 }).years[1].buy.rentalIncomeNet;
  // 0 personal → all 250 listed nights available; 200 personal → only 165 left,
  // capping listed nights and therefore income.
  assert.ok(heavyPersonal < noPersonal, `expected heavy personal use to reduce rental income (${heavyPersonal} vs ${noPersonal})`);
  assert.ok(Math.abs(heavyPersonal - 16500) < 1, `expected 165 booked nights × $100 = 16500, got ${heavyPersonal}`);
});

test("runModel: rental turnover cost scales with booked nights, not listed nights", () => {
  const inputs = { ...DEFAULT_INPUTS, usageMode: "rental", rentalNightsPerYear: 60, occupancyRate: 0.5, rentalNightlyRate: 175, propertyMgmtFeePct: 0.2, platformFeePct: 0.03, turnoverCostPerStay: 75 };
  const net = runModel(inputs).years[1].buy.rentalIncomeNet;
  // 30 booked nights → gross 5250; mgmt 1050; platform 157.5; 10 stays × $75 = 750 turnover.
  const expected = 5250 - 1050 - 157.5 - 750;
  assert.ok(Math.abs(net - expected) < 1, `expected ~${expected}, got ${net}`);
});

test("runModel: expensive house vs. rare cheap Airbnb trips does not break even in horizon", () => {
  const result = runModel({
    ...DEFAULT_INPUTS,
    financing: "mortgage",
    purchasePrice: 400000,
    downPaymentPct: 0.2,
    interestRate: 0.075,
    airbnbNightlyRate: 80,
    airbnbTripsPerYear: 1,
    airbnbNightsPerTrip: 3,
    homeAppreciationRate: 0,
    horizonYears: 10,
  });
  assert.equal(result.breakevenYear, null);
});

test("runModel: rental income reduces buy-path net cost vs. personal-use-only, all else equal", () => {
  const base = { ...DEFAULT_INPUTS, usageMode: "personal" };
  const rented = { ...DEFAULT_INPUTS, usageMode: "rental" };
  const resultBase = runModel(base);
  const resultRented = runModel(rented);
  const last = (r) => r.years[r.years.length - 1].buy.netCost;
  assert.ok(last(resultRented) < last(resultBase), "renting when vacant should lower net cost");
});

// --- sensitivitySweep ----------------------------------------------------------

test("sensitivitySweep: higher appreciation never makes breakeven later", () => {
  const sweep = sensitivitySweep(DEFAULT_INPUTS, "homeAppreciationRate", [0.0, 0.03, 0.06]);
  const breakevens = sweep.map((s) => (s.breakevenYear === null ? Infinity : s.breakevenYear));
  assert.ok(breakevens[0] >= breakevens[1] && breakevens[1] >= breakevens[2], `expected non-increasing breakeven years, got ${breakevens}`);
});

test("sensitivitySweep: gapAtHorizon shrinks (buying gets relatively cheaper) as appreciation rises", () => {
  const sweep = sensitivitySweep(DEFAULT_INPUTS, "homeAppreciationRate", [0.0, 0.03, 0.06]);
  const gaps = sweep.map((s) => s.gapAtHorizon);
  assert.ok(gaps.every((g) => Number.isFinite(g)), `expected all gaps finite, got ${gaps}`);
  assert.ok(gaps[0] >= gaps[1] && gaps[1] >= gaps[2], `expected non-increasing gap as appreciation rises, got ${gaps}`);
});

// --- report --------------------------------------------------------------------

console.log(`${passed}/${passed + failures.length} tests passed`);
if (failures.length) {
  for (const f of failures) {
    console.error(`\nFAIL: ${f.name}`);
    console.error(f.err);
  }
  process.exit(1);
}
