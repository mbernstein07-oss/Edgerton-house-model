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
// Returns null fields as undefined so callers can skip overriding when there's
// not enough data to trust (e.g. a single trip shouldn't dictate trips/year).
export function historyToInputOverrides(aggregate) {
  if (!aggregate || aggregate.tripCount === 0) return {};
  const overrides = {
    airbnbNightlyRate: round2(aggregate.avgNightlyRate),
    airbnbNightsPerTrip: round1(aggregate.avgNightsPerTrip),
  };
  if (aggregate.avgCleaningFee > 0) overrides.airbnbCleaningFee = round2(aggregate.avgCleaningFee);
  // Trips/year from a single confirmed trip is too thin a sample to override
  // the default cadence assumption; only apply it once there's a real trend.
  if (aggregate.tripCount >= 3) overrides.airbnbTripsPerYear = round1(aggregate.avgTripsPerYear);
  return overrides;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
function round1(n) {
  return Math.round(n * 10) / 10;
}
