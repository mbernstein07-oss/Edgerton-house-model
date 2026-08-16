// "Smart" scenario analysis — a rules engine that reads a specific set of
// inputs and writes plain-language, scenario-specific observations (why the
// verdict comes out the way it does, what's driving it, what would flip it).
// Pure and deterministic: same inputs → same words, always consistent with the
// numbers the model produces. No live AI / network — it runs in the page.

import { runModel } from "./model.js";

function fmtUSD(n) {
  return Math.round(n).toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
function fmtPct(x, digits = 1) {
  return `${(x * 100).toFixed(digits)}%`;
}

// Binary-search the value of `lever` in [lo, hi] where the horizon gap
// (buy minus Airbnb; >0 = buying behind) crosses zero. Assumes the gap is
// monotonic in the lever (true for price, appreciation, alt-return). Returns
// null when there's no crossing in range.
function solveGapZero(inputs, lever, lo, hi) {
  const gapAt = (v) => runModel({ ...inputs, [lever]: v }).summary.buyMinusAirbnbAtHorizon;
  let glo = gapAt(lo);
  const ghi = gapAt(hi);
  if (glo > 0 === ghi > 0) return null;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const gm = gapAt(mid);
    if (gm > 0 === glo > 0) {
      lo = mid;
      glo = gm;
    } else {
      hi = mid;
    }
  }
  return (lo + hi) / 2;
}

// Returns { takeaway, points } — a one-line plain-English takeaway plus a few
// supporting observations, all specific to these inputs.
export function analyzeScenario(inputs) {
  const result = runModel(inputs);
  const N = inputs.horizonYears;
  const last = result.years[N];
  const gap = result.summary.buyMinusAirbnbAtHorizon; // >0 = buying behind at horizon
  const breakeven = result.breakevenYear;
  const buyingWins = gap <= 0;

  // Average annual net cost to carry the house (excludes the one-time upfront).
  const avgCarry = (last.buy.cumulativeCashOutflow - result.upfrontCash) / N;
  // How many nights a year you actually spend in the area (your travel demand).
  const nightsYouGo = inputs.airbnbTripsPerYear * inputs.airbnbNightsPerTrip;
  const perNight = nightsYouGo > 0 ? avgCarry / nightsYouGo : Infinity;

  const investorWealth = last.airbnb.sideFund; // what "keep renting & invest" accumulates
  const ownerEquity = last.buy.equityIfSold; // what selling the house would leave

  const points = [];

  // --- Usage: the per-night reality check (the most intuitive driver) ---
  if (nightsYouGo > 0 && !buyingWins && perNight > inputs.airbnbNightlyRate * 1.2) {
    const nightsToMatch = Math.round(avgCarry / inputs.airbnbNightlyRate);
    points.push(
      `A house costs about ${fmtUSD(avgCarry)}/yr to carry whether you're there 10 nights or 100. Across the ~${Math.round(nightsYouGo)} nights a year you'd actually use it, that works out to roughly ${fmtUSD(perNight)} a night — versus ${fmtUSD(inputs.airbnbNightlyRate)} to just book it. You'd need to stay closer to ${nightsToMatch} nights a year before owning is the cheaper way to sleep there.`
    );
  }

  // --- Opportunity cost: the market vs. the house ---
  if (!buyingWins && investorWealth > ownerEquity * 1.1) {
    points.push(
      `Opportunity cost is doing most of the damage: the cash you'd commit — ${fmtUSD(result.upfrontCash)} upfront, plus the extra you'd spend each year over Airbnb-ing — would grow to about ${fmtUSD(investorWealth)} invested at ${fmtPct(inputs.altInvestmentReturn, 0)}. Selling the house after ${N} years would leave you around ${fmtUSD(ownerEquity)}.`
    );
  }

  // --- What would flip (or break) the verdict ---
  if (!buyingWins) {
    const apprNeeded = solveGapZero(inputs, "homeAppreciationRate", inputs.homeAppreciationRate, 0.3);
    const priceNeeded = solveGapZero(inputs, "purchasePrice", 20000, inputs.purchasePrice);
    if (apprNeeded !== null && apprNeeded < 0.1) {
      points.push(`It would tip toward buying if the house appreciated faster than about ${fmtPct(apprNeeded)} a year (you've got ${fmtPct(inputs.homeAppreciationRate)} set) — everything else held equal.`);
    } else if (priceNeeded !== null && priceNeeded > 30000) {
      points.push(`Short of a much higher appreciation rate, the price would need to be around ${fmtUSD(priceNeeded)} or lower to break even at this usage — versus the ${fmtUSD(inputs.purchasePrice)} entered.`);
    } else {
      points.push(
        `No single realistic dial — appreciation, interest, or investment return — closes this gap at your current usage.${inputs.usageMode !== "rental" ? " The two levers that actually move it are how much you'd use the place and whether you rent it out when you're away (the Usage tab)." : " It really comes down to how much you'd use it."}`
      );
    }
  } else {
    // Buying wins — say why it's cheap to stay, then how robust it is.
    if (nightsYouGo > 0 && perNight < inputs.airbnbNightlyRate) {
      points.push(`At the rate you'd use it, owning works out to about ${fmtUSD(perNight)} a night against ${fmtUSD(inputs.airbnbNightlyRate)} to book each time — owning is simply the cheaper way to stay this often.`);
    }
    const apprBreak = solveGapZero(inputs, "homeAppreciationRate", -0.1, inputs.homeAppreciationRate);
    if (apprBreak === null) {
      points.push(`It's robust, too: it still comes out ahead even with flat or falling home values over the ${N} years.`);
    } else if (apprBreak < 0) {
      points.push(`It's fairly robust — home values could fall as much as about ${fmtPct(Math.abs(apprBreak))} a year and buying would still win.`);
    } else {
      points.push(`This holds as long as appreciation stays above roughly ${fmtPct(apprBreak)} a year; much below that and Airbnb-ing wins again.`);
    }
  }

  // --- Mode-specific colour ---
  if (inputs.usageMode === "rental" && last.buy.rentalIncomeNet > 0) {
    const grossCarry = avgCarry + last.buy.rentalIncomeNet;
    const pct = Math.round((last.buy.rentalIncomeNet / grossCarry) * 100);
    points.push(`Renting it out when you're away nets about ${fmtUSD(last.buy.rentalIncomeNet)}/yr after fees and cleaning — covering roughly ${pct}% of the carrying cost.`);
  } else if (inputs.financing === "cash" && !buyingWins) {
    points.push(`Paying all cash is what ties up the most capital here — a mortgage would keep more of it invested (at the cost of interest). Worth saving both as scenarios and comparing.`);
  }

  // --- One-line takeaway, chosen from what actually dominates ---
  let takeaway;
  if (buyingWins) {
    takeaway = breakeven
      ? `This one genuinely pays off — buying moves ahead in year ${breakeven} and stays there.`
      : `Buying comes out ahead by the end of the ${N} years here.`;
  } else if (nightsYouGo > 0 && perNight > inputs.airbnbNightlyRate * 2.5) {
    takeaway = `The math isn't close, and it's mostly about how little you'd use the place — you'd be paying house-sized costs for a handful of nights.`;
  } else if (investorWealth > ownerEquity * 1.5) {
    takeaway = `It's opportunity cost that sinks this: the money simply does more in the market than tied up in a house you'd use lightly.`;
  } else {
    takeaway = `Buying trails Airbnb-ing here, but it's closer than the headline number alone suggests — the levers below are where it's decided.`;
  }

  return { takeaway, points, breakeven, buyingWins };
}
