// Named "scenarios" — a full snapshot of the model inputs, saved locally in
// the browser (localStorage) under a name so it can be reloaded later without
// re-entering every slider. This is per-browser, not synced anywhere; pair a
// saved scenario with "Copy link" (below) to actually send it to someone else.

const STORAGE_KEY = "edgerton-house-model:scenarios:v1";

function hasStorage() {
  try {
    return typeof localStorage !== "undefined" && localStorage !== null;
  } catch (e) {
    return false;
  }
}

function readAll() {
  if (!hasStorage()) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn("Could not read saved scenarios", e);
    return [];
  }
}

function writeAll(scenarios) {
  if (!hasStorage()) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scenarios));
  } catch (e) {
    console.warn("Could not save scenarios (storage full or unavailable)", e);
  }
}

function makeId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// Newest first.
export function listScenarios() {
  return readAll().sort((a, b) => b.savedAt - a.savedAt);
}

// Stores a full snapshot of `inputs` (every key), not a diff against
// defaults — defaults can change over time (e.g. history-derived overrides
// shift as more trips are added), and a scenario should reproduce exactly
// what was on screen when it was saved, not "whatever the diff meant then."
export function saveScenario(name, inputs) {
  const scenarios = readAll();
  const entry = { id: makeId(), name: name.trim() || "Untitled scenario", savedAt: Date.now(), inputs: { ...inputs } };
  scenarios.push(entry);
  writeAll(scenarios);
  return entry;
}

export function deleteScenario(id) {
  writeAll(readAll().filter((s) => s.id !== id));
}

// Short, human-readable one-liner describing a scenario's key levers. Pure —
// no storage access — so it's easy to unit test and reuse.
export function summarizeScenario(inputs) {
  const parts = [inputs.financing === "cash" ? "Cash" : "Mortgage"];
  if (inputs.purchasePrice != null) parts.push(fmtShortUSD(inputs.purchasePrice));
  parts.push(inputs.usageMode === "rental" ? "Rent when vacant" : "Personal use only");
  if (inputs.horizonYears != null) parts.push(`${inputs.horizonYears}-yr horizon`);
  return parts.join(" · ");
}

function fmtShortUSD(n) {
  if (Math.abs(n) >= 1000) return `$${Math.round(n / 1000)}k`;
  return `$${Math.round(n)}`;
}
