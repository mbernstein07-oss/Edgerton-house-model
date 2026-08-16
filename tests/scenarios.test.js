// Plain-Node sanity checks for the localStorage-backed scenario store.
// Run with: node tests/scenarios.test.js (or: npm test)

import assert from "node:assert/strict";

// Minimal in-memory localStorage shim — Node has no localStorage global, and
// scenarios.js reads it at call time (not import time), so installing this
// before importing the module is enough.
class MemoryStorage {
  constructor() {
    this.store = new Map();
  }
  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }
  setItem(key, value) {
    this.store.set(key, String(value));
  }
  removeItem(key) {
    this.store.delete(key);
  }
}
globalThis.localStorage = new MemoryStorage();

const { listScenarios, saveScenario, deleteScenario, summarizeScenario } = await import("../src/scenarios.js");

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

test("listScenarios starts empty", () => {
  assert.deepEqual(listScenarios(), []);
});

test("saveScenario persists and round-trips the full inputs snapshot", () => {
  const entry = saveScenario("Cash purchase", { financing: "cash", purchasePrice: 200000, usageMode: "personal", horizonYears: 10 });
  assert.equal(entry.name, "Cash purchase");
  assert.ok(entry.id);
  const all = listScenarios();
  assert.equal(all.length, 1);
  assert.equal(all[0].inputs.purchasePrice, 200000);
});

test("saveScenario falls back to a default name when blank", () => {
  const entry = saveScenario("   ", { financing: "mortgage" });
  assert.equal(entry.name, "Untitled scenario");
});

test("listScenarios returns newest first", () => {
  globalThis.localStorage = new MemoryStorage();
  // Write two entries directly with controlled timestamps rather than relying
  // on wall-clock timing between two saveScenario() calls in the same tick.
  globalThis.localStorage.setItem(
    "edgerton-house-model:scenarios:v1",
    JSON.stringify([
      { id: "old", name: "Older", savedAt: 1000, inputs: {} },
      { id: "new", name: "Newer", savedAt: 2000, inputs: {} },
    ])
  );
  const all = listScenarios();
  assert.deepEqual(all.map((s) => s.id), ["new", "old"]);
});

test("deleteScenario removes only the targeted entry", () => {
  globalThis.localStorage = new MemoryStorage();
  const a = saveScenario("A", { financing: "cash" });
  const b = saveScenario("B", { financing: "mortgage" });
  deleteScenario(a.id);
  const remaining = listScenarios();
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].id, b.id);
});

test("summarizeScenario produces a short readable line", () => {
  const s = summarizeScenario({ financing: "cash", purchasePrice: 220000, usageMode: "rental", horizonYears: 10 });
  assert.equal(s, "Cash · $220k · Rent when vacant · 10-yr horizon");
});

test("summarizeScenario labels mortgage + personal-use correctly", () => {
  const s = summarizeScenario({ financing: "mortgage", purchasePrice: 195000, usageMode: "personal", horizonYears: 5 });
  assert.equal(s, "Mortgage · $195k · Personal use only · 5-yr horizon");
});

console.log(`${passed}/${passed + failures.length} tests passed`);
if (failures.length) {
  for (const f of failures) {
    console.error(`\nFAIL: ${f.name}`);
    console.error(f.err);
  }
  process.exit(1);
}
