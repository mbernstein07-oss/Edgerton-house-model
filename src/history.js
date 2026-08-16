// Loads data/airbnb-history.json and aggregates it into baseline defaults for
// the Airbnb-status-quo inputs. Kept separate from model.js so the pure math
// never has to know where numbers came from, and separate from ui.js so it
// can be tested/reused headlessly.

export async function loadHistory(url = "./data/airbnb-history.json") {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return res.json();
}

// Pure aggregation, testable without fetch. Accepts the parsed JSON document.
export function aggregateHistory(historyData) {
  const trips = (historyData && historyData.trips) || [];

  if (trips.length === 0) {
    return {
      tripCount: 0,
      yearsSpanned: 0,
      avgTripsPerYear: null,
      avgNightsPerTrip: null,
      avgNightlyRate: null,
      avgCleaningFee: null,
      trips: [],
      unconfirmedTrips: (historyData && historyData.unconfirmedTrips) || [],
    };
  }

  // Trips/year = trips divided by the elapsed window they actually span
  // (first check-in to last check-out), not by the count of distinct calendar
  // years touched. Counting calendar years badly undercounts the cadence when
  // the first and last years are only partially covered — e.g. 5 trips spread
  // from Dec 2023 to May 2026 touch 4 calendar years (→ a misleading 1.25/yr)
  // but really represent ~2 trips/yr across a ~2.4-year window. Floored at 1
  // year so a tight cluster of trips can't explode the rate.
  const sortedByCheckIn = [...trips].sort((a, b) => new Date(a.checkIn) - new Date(b.checkIn));
  const firstCheckIn = new Date(sortedByCheckIn[0].checkIn);
  const lastCheckOut = new Date(sortedByCheckIn[sortedByCheckIn.length - 1].checkOut);
  const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;
  const yearsSpanned = Math.max(1, (lastCheckOut - firstCheckIn) / MS_PER_YEAR);

  const totalNights = trips.reduce((sum, t) => sum + t.nights, 0);
  const totalPaid = trips.reduce((sum, t) => sum + t.totalPricePaid, 0);
  const totalCleaning = trips.reduce((sum, t) => sum + (t.cleaningFeeBrokenOut || 0), 0);

  const avgNightsPerTrip = totalNights / trips.length;
  const avgNightlyRate = totalPaid / totalNights;
  const avgCleaningFee = totalCleaning / trips.length;
  const avgTripsPerYear = trips.length / yearsSpanned;

  return {
    tripCount: trips.length,
    yearsSpanned,
    avgTripsPerYear,
    avgNightsPerTrip,
    avgNightlyRate,
    avgCleaningFee,
    trips,
    unconfirmedTrips: (historyData && historyData.unconfirmedTrips) || [],
  };
}

// Maps aggregated history onto the subset of DEFAULT_INPUTS keys it can inform.
// Values are rounded to each field's slider step so the slider thumb lands
// exactly on the value (otherwise a value like 175.6 on a step-5 slider snaps
// the thumb to 175 while state stays 175.6 — a phantom "adjusted" state).
export function historyToInputOverrides(aggregate) {
  if (!aggregate || aggregate.tripCount === 0) return {};

  const nightly = round5(aggregate.avgNightlyRate);
  const overrides = {
    airbnbNightlyRate: nightly,
    airbnbNightsPerTrip: Math.round(aggregate.avgNightsPerTrip),
    // What you've actually paid for comparable stays in the area is the best
    // available comp for what a place you owned could rent for, so seed the
    // rent-it-out nightly rate from the same history.
    rentalNightlyRate: nightly,
  };
  if (aggregate.avgCleaningFee > 0) overrides.airbnbCleaningFee = round2(aggregate.avgCleaningFee);

  // Cadence-derived inputs need more than one or two trips to be meaningful.
  if (aggregate.tripCount >= 3) {
    overrides.airbnbTripsPerYear = Math.round(aggregate.avgTripsPerYear);
    // Nights/year you'd personally use the house ≈ nights/year you already
    // spend in the area (trips per year × nights per trip).
    overrides.personalNightsPerYear = Math.round(aggregate.avgTripsPerYear * aggregate.avgNightsPerTrip);
  }
  return overrides;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
function round5(n) {
  return Math.round(n / 5) * 5;
}
