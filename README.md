# Edgerton, OH — Buy vs. Airbnb

An interactive, single-page calculator for one question: **does buying a house in/near Edgerton, Ohio make more financial sense than continuing to book Airbnbs there?**

It's a static site (vanilla JS, no build step, no backend) meant to be shared as a link — every input is encoded into the URL, so a specific scenario (e.g. "here's what it looks like if we rent it out half the year") can be sent to someone else and they'll see exactly the same numbers.

Live at: `https://mbernstein07-oss.github.io/edgerton-house-model/` once GitHub Pages is enabled for this repo (see **Deploying**, below). Locally, open it with any static file server (see **Running it locally**) — opening `index.html` directly via `file://` won't work because the app `fetch()`s `data/airbnb-history.json`.

## What it does

- Models **both** financing paths (cash vs. mortgage, with amortization/PMI) and **both** usage paths (personal-use-only vs. rent-out-when-vacant) as toggles on one page — not four separate tools.
- Computes a year-by-year "net cost" for two paths — **Buy** and **Keep doing Airbnb** — where net cost = cumulative cash spent minus the value you'd have to show for it (home equity if sold, or an invested cash balance).
- Reports the **breakeven year**: the first year Buy's net cost drops below Airbnb's net cost, if that happens within your time horizon.
- Shows a small **sensitivity table**: how the breakeven year shifts if appreciation, mortgage rate, or (when renting) occupancy comes in higher or lower than assumed.
- Seeds the Airbnb-baseline inputs (nightly rate, nights/trip) from **real historical trip data** pulled from Gmail, with an auditable table of the underlying trips — see below.

## Project layout

```
index.html              entry point — loads Chart.js, styles, then src/ui.js
data/airbnb-history.json   historical Airbnb trips (see "Historical data" below)
src/model.js             pure calculation functions — no DOM, unit-testable
src/history.js           loads + aggregates airbnb-history.json into defaults
src/ui.js                renders the input form, wires events, syncs the URL
src/charts.js            Chart.js line-chart rendering
src/styles.css           theme-aware (light/dark) styling
vendor/chart.umd.min.js  Chart.js, vendored so the page has no CDN dependency
tests/model.test.js      plain-Node sanity checks on the math
```

`model.js` never touches the DOM — it's a set of pure functions in, plain objects out — so the math can be tested and reused independently of the UI (and reasoned about without opening a browser).

## Running it locally

```bash
npm run serve      # python3 -m http.server 8080
# then open http://localhost:8080
```

Any static server works — the only requirement is that `fetch("./data/airbnb-history.json")` resolves, which `file://` URLs don't allow in most browsers.

## Running the tests

```bash
node tests/model.test.js    # or: npm test
```

No test framework or `npm install` required — it's a plain Node script using the built-in `assert` module, importing `src/model.js` directly as an ES module.

## Deploying to GitHub Pages

No build step needed:

1. In this repo's **Settings → Pages**, set the source to the `main` branch, root folder.
2. Once published, it's reachable at `https://mbernstein07-oss.github.io/edgerton-house-model/`.

## Updating default assumptions

All defaults live in one place: `DEFAULT_INPUTS` at the top of `src/model.js`. Section comments (`// A. Airbnb baseline`, `// B. Purchase`, etc.) match the input groupings in the UI. Change a default there and it flows through to the form, the URL-diffing logic (only non-default values get encoded into shareable links), and the "Reset to defaults" button.

A few defaults are **overridden at load time** by real data instead of being hardcoded — see the next section.

## Historical Airbnb data

`data/airbnb-history.json` holds real trip history for the Edgerton/Williams County, OH area, pulled from Gmail. `src/history.js` aggregates it into computed defaults for the "Airbnb baseline" section (avg nightly rate, avg nights/trip) at page load — those computed values still show up as ordinary editable sliders, they're just pre-filled from reality instead of a guess. The raw trips are listed in the collapsible "Historical Airbnb trips backing the defaults" panel on the page so the numbers are auditable, not a black box.

**Confirmation logic:** a trip only counts as "used" (and feeds the defaults) if both a booking confirmation email *and* a matching post-stay review email (the "leave a review" prompt Airbnb sends a day or two after checkout, and/or the host's review of the guest) were found for the same reservation. A booking confirmation with no matching review email is filed under `unconfirmedTrips` in the JSON instead — logged, but excluded from the averages, since a booking alone doesn't prove the trip wasn't cancelled.

As of the last refresh (2026-08-15), there is **one** confirmed trip in the dataset — a 9-night stay at Newdale Bungalow in Bryan, OH (~8 miles from Edgerton), May 14–23, 2026. With only one data point, the "trips per year" default was deliberately *not* overridden by history (one trip doesn't establish a cadence); nightly rate and nights/trip were, since those are reasonable to anchor on a single real stay. As more trips accumulate, `history.js` will start trusting the trips/year average too (currently gated at 3+ confirmed trips — see `historyToInputOverrides` in `src/history.js`).

### Refreshing the historical dataset

This is not a live integration — refreshing means re-running a Gmail search and hand-editing the JSON, the same pattern used for other trackers built on this account (e.g. a ticket-purchase tracker that works the same way). To pull in new trips:

1. Search Gmail for new Airbnb activity in the area since the last recorded trip's `checkIn` date:
   ```
   from:(automated@airbnb.com OR express@airbnb.com) ("Bryan, OH" OR "Edgerton" OR "Williams County" OR "Montpelier, OH" OR "Defiance, OH" OR <specific listing name/address if known>) after:<last-trip-checkout-date>
   ```
2. For each new booking confirmation found, look for a matching post-stay email in the same thread or nearby in time — subject lines like *"Write a review for \<host\>"* or *"\<host\> shared a review of your stay in \<city\>"*. Only trips with both count as confirmed.
3. Pull check-in/check-out dates, total price paid, nightly rate, cleaning fee (if broken out separately — many hosts don't), and the booking date from the confirmation/receipt email.
4. Append a new entry to the `trips` array in `data/airbnb-history.json` (same shape as the existing entry, including the `confirmationEvidence` block with the Gmail thread IDs for both the booking and review emails, for auditability). Add anything confirmation-only-no-review to `unconfirmedTrips` instead.
5. Update `_meta.lastRefreshed`.
6. Commit the updated JSON. Nothing else needs to change — `history.js` re-aggregates on next page load.

The JSON is meant to be human-readable and hand-editable: if a record needs correcting (e.g. a price was mis-parsed), just edit it directly.

## Modeling notes & simplifications

Kept intentionally out of scope, per the project brief:

- **No full tax-return modeling.** The mortgage-interest/property-tax deduction and rental-income tax are both flat-rate approximations (`marginalTaxRate` × deductible amount, `rentalIncomeTaxRate` × net rental income) — no standard-deduction crowd-out, no SALT cap, no depreciation/Schedule E line items.
- **No live data feeds.** Purchase price, comps, and market assumptions are inputs you set, not something pulled from Zillow/Airbnb APIs. This is a planning tool, not a scraper.
- **No accounts, no server.** State lives entirely in the URL query string.

A couple of modeling choices worth knowing about if you're extending `model.js`:

- **"Net cost" = cumulative cash outflow − recoverable value.** For Buy, recoverable value is home equity if sold at that point (appreciated value minus selling costs minus remaining loan balance). For Airbnb, it's the invested balance of the cash you *didn't* spend buying a house (down payment + closing + furnishing), compounding at your assumed alternative-investment return. Breakeven is where the two lines cross.
- **Rental turnover cost** assumes an average 3-night rented stay (to convert "nights rented per year" into "number of turnovers per year" for the per-stay cleaning cost). Not exposed as an input — see `ASSUMED_RENTAL_STAY_NIGHTS` in `model.js` if that assumption needs to change.
- **A cash purchase can lose to Airbnb purely on opportunity cost.** Paying 100% cash ties up far more capital than a mortgage's down payment does; if that capital would otherwise be invested at a healthy return, its growth can outpace even an expensive Airbnb habit. This is intentional (see the two `runModel` tests in `tests/model.test.js` that pin this down) — it's a legitimate reason cash and mortgage scenarios can reach different conclusions for the same house.
