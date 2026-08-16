// Plain-Node sanity checks for the scenario analyzer.
// Run with: node tests/insights.test.js  (or: npm test)

import assert from "node:assert/strict";
import { DEFAULT_INPUTS } from "../src/model.js";
import { analyzeScenario } from "../src/insights.js";

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

test("default scenario: buying does not win, with a non-empty tailored analysis", () => {
  const a = analyzeScenario(DEFAULT_INPUTS);
  assert.equal(a.buyingWins, false);
  assert.ok(typeof a.takeaway === "string" && a.takeaway.length > 0);
  assert.ok(a.points.length >= 2, `expected multiple points, got ${a.points.length}`);
});

test("default scenario surfaces the per-night usage reality check", () => {
  const a = analyzeScenario(DEFAULT_INPUTS);
  assert.ok(a.points.some((p) => /a night/.test(p)), "expected a per-night comparison point");
});

test("a strongly favorable scenario reports that buying pays off", () => {
  const a = analyzeScenario({ ...DEFAULT_INPUTS, financing: "cash", purchasePrice: 110000, airbnbNightlyRate: 450, airbnbTripsPerYear: 8, airbnbNightsPerTrip: 10, horizonYears: 15 });
  assert.equal(a.buyingWins, true);
  assert.ok(/pays off|ahead/.test(a.takeaway), `unexpected takeaway: ${a.takeaway}`);
  assert.ok(a.points.length >= 1);
});

test("rental scenario mentions the rental income offset", () => {
  const a = analyzeScenario({ ...DEFAULT_INPUTS, usageMode: "rental", rentalNightsPerYear: 220, occupancyRate: 0.7, rentalNightlyRate: 180, horizonYears: 15 });
  assert.ok(a.points.some((p) => /Renting it out/.test(p)), "expected a rental-offset point");
});

test("cash purchase that loses flags the tied-up-capital tradeoff", () => {
  const a = analyzeScenario({ ...DEFAULT_INPUTS, financing: "cash" });
  assert.ok(a.points.some((p) => /all cash/.test(p)), "expected a cash-specific point");
});

test("analysis is deterministic (same inputs → same words)", () => {
  const a = analyzeScenario(DEFAULT_INPUTS);
  const b = analyzeScenario(DEFAULT_INPUTS);
  assert.deepEqual(a, b);
});

console.log(`${passed}/${passed + failures.length} tests passed`);
if (failures.length) {
  for (const f of failures) {
    console.error(`\nFAIL: ${f.name}`);
    console.error(f.err);
  }
  process.exit(1);
}
