# Edgerton, OH — Buy vs. Airbnb

An interactive, single-page calculator for one question: **does buying a house in/near Edgerton, Ohio make more financial sense than continuing to book Airbnbs there?**

It's a static site (vanilla JS, no build step, no backend) meant to be shared as a link — every input is encoded into the URL, so a specific scenario (e.g. "here's what it looks like if we rent it out half the year") can be sent to someone else and they'll see exactly the same numbers.

Live at: `https://mbernstein07-oss.github.io/edgerton-house-model/` once GitHub Pages is enabled for this repo (see **Deploying**, below). Locally, open it with any static file server (see **Running it locally**) — opening `index.html` directly via `file://` won't work because the app `fetch()`s `data/airbnb-history.json`.

## What it does

- Models **both** financing paths (cash vs. mortgage, with amortization/PMI) and **both** usage paths (personal-use-only vs. rent-out-when-vacant) as toggles on one page — not four separate tools.
- The main chart has **two views** you toggle between:
  - **Cash out of pocket** (default) — the plain-dollars comparison: every dollar that actually leaves your pocket on each path (trip payments vs. down payment + all carrying costs). This is the intuitive "how much does each path cost me" picture, and it makes the usual reality obvious — a house's yearly carrying cost dwarfs a few trips' worth of Airbnb.
  - **Cost after resale** — the true economic comparison: the house is credited with its resale value (appreciation + loan paydown − selling costs), and the Airbnb path is credited with investment growth on the cash you *didn't* sink into a down payment. Where the two lines cross is the **breakeven year**; a value below zero means that path is ahead overall.
- The **summary card** leads with the head-to-head annual numbers (`$X/yr on Airbnb` vs `$Y/yr to own`, plus upfront cash and horizon totals) and a one-line plain-English verdict, so the bottom line is legible without reading the chart. The `$/yr` figures are averages over the whole horizon, not a year-1 snapshot — deliberately, so they actually move when you change the Airbnb growth rate, appreciation, or the horizon length, instead of looking frozen while everything else on the page updates.
- The **sensitivity table** shows how the year-N outcome shifts if appreciation, alternative-investment return, mortgage rate, or (when renting) occupancy come in higher or lower than assumed — and unlike a plain "does it break even? yes/no" table, every cell states the actual dollar gap (or the breakeven year, highlighted, when one is reached), so a scenario that's nowhere near breaking even still shows *which direction and how much* each lever moves it, instead of a wall of identical "never"s. When nothing in the table gets a scenario to breakeven, a note says so explicitly and points at the bigger levers (price, financing, renting it out) instead of leaving that to be inferred.
- Seeds several inputs from **real historical trip data** pulled from Gmail — not just the Airbnb baseline (nightly rate, nights/trip, trips/year) but also how many nights a year you'd personally use a house (≈ how many nights you already travel to the area) and, if you rent it out, the nightly rate a comparable local place commands (≈ what you've been paying). Every seeded value stays an ordinary editable input; the trip table backing them is auditable in the "Trip history" tab. See below.
- Inputs are organized as **tabs** (Airbnb / Purchase / Ownership / Usage / Financial) instead of one long scroll, with a dot on any tab that's been changed from its default. The summary card stays pinned at the top of the results column while you tune inputs. A small "Sensitivity, history & scenarios" jump link appears at the top on narrow screens.
- **Save named scenarios** to come back to later or compare against each other — see below.
- A **"How this works" button** (top toolbar) opens an in-app explainer covering the two chart views, the opportunity-cost method behind the after-resale comparison, and the key simplifications — so the numbers aren't a black box. Its content lives in `src/help.js`.

## Saving scenarios

The "Scenarios" tab (next to Sensitivity and Trip history) lets you name and save the *entire* current set of inputs, then reload it later with one click. It's for comparing a handful of named setups against each other — "Cash, personal use only" vs. "Mortgage, rent when vacant" — without re-dialing every slider each time.

- **Save**: type a name, click "Save current inputs." It stores a full snapshot of every input at that moment (not a diff against current defaults), so a saved scenario reproduces exactly what was on screen when you saved it, even if the app's defaults change later.
- **Load**: brings every input back to that snapshot. A row shows a "currently viewing" badge and a disabled Load button when the live inputs match it exactly.
- **Copy link**: generates a shareable URL for that scenario specifically (same encoding as the toolbar's "Copy shareable link," just without needing to load it first).
- **Delete**: click once to arm ("Confirm delete?"), click again within a few seconds to actually delete — or let it auto-cancel.

Scenarios are stored in the browser's `localStorage`, scoped to this page's origin. That means: they're **per-browser, not synced** — they won't show up if you open the page in a different browser, a different device, or an incognito window, and clearing site data removes them. They also don't get bundled into a shared link automatically; if you want someone else to see a saved scenario, use its "Copy link" button and send that URL. See `src/scenarios.js` for the storage logic and `tests/scenarios.test.js` for its sanity checks (using an in-memory `localStorage` shim, since Node has no such global).

## Project layout

```
index.html              entry point — loads Chart.js, styles, then src/ui.js
data/airbnb-history.json   historical Airbnb trips (see "Historical data" below)
src/model.js             pure calculation functions — no DOM, unit-testable
src/history.js           loads + aggregates airbnb-history.json into defaults
src/scenarios.js         localStorage-backed named-scenario save/load/delete
src/help.js              "How this works" content shown in the in-app modal
src/ui.js                renders the input form, wires events, syncs the URL
src/charts.js            Chart.js line-chart rendering
src/styles.css           theme-aware (light/dark) styling
vendor/chart.umd.min.js  Chart.js, vendored so the page has no CDN dependency
tests/model.test.js      plain-Node sanity checks on the math
tests/scenarios.test.js  plain-Node sanity checks on scenario storage
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
npm test    # or: node tests/model.test.js && node tests/scenarios.test.js
```

No test framework or `npm install` required — both are plain Node scripts using the built-in `assert` module, importing straight from `src/*.js` as ES modules.

## Deploying to GitHub Pages

No build step needed:

1. In this repo's **Settings → Pages**, set the source to the `main` branch, root folder.
2. Once published, it's reachable at `https://mbernstein07-oss.github.io/edgerton-house-model/`.

## Updating default assumptions

All defaults live in one place: `DEFAULT_INPUTS` at the top of `src/model.js`. Section comments (`// A. Airbnb baseline`, `// B. Purchase`, etc.) match the input groupings in the UI. Change a default there and it flows through to the form, the URL-diffing logic (only non-default values get encoded into shareable links), and the "Reset to defaults" button.

A few defaults are **overridden at load time** by real data instead of being hardcoded — see the next section.

## Historical Airbnb data

`data/airbnb-history.json` holds real trip history for the Edgerton/Williams County, OH area, pulled from Gmail. `src/history.js` aggregates it into computed defaults for the "Airbnb baseline" section (avg nightly rate, avg nights/trip) at page load — those computed values still show up as ordinary editable sliders, they're just pre-filled from reality instead of a guess. The raw trips are listed in the collapsible "Historical Airbnb trips backing the defaults" panel on the page so the numbers are auditable, not a black box.

**Confirmation logic:** a trip only counts as "used" (and feeds the defaults) if both a booking confirmation email *and* a matching post-stay review email (the "leave a review" prompt Airbnb sends a day or two after checkout, and/or the host's review of the guest) were found for the same reservation. A booking confirmation with an explicit cancellation email, or with no matching review email, is filed under `unconfirmedTrips` in the JSON instead — logged, but excluded from the averages.

As of the last refresh (2026-08-15), there are **5 confirmed trips** in the dataset, all within about an hour's drive of Edgerton: Avilla, IN (Dec 2023); Auburn, IN (Sep 2024); Fort Wayne, IN (Sep 2024); Hicksville, OH (Nov 2025); and Bryan, OH (May 2026) — plus 3 more bookings in the same area that were cancelled before check-in (also logged, for a complete picture, but excluded from the averages). With 5 confirmed trips, `history.js` (`historyToInputOverrides`) seeds five inputs from the real data:

| Input | Seeded from | Value |
|---|---|---|
| Airbnb avg nightly rate | total paid ÷ total nights | ~$175 |
| Airbnb nights per trip | avg over the trips | 8 |
| Airbnb trips per year | trips ÷ elapsed window (see below) | 2 |
| Personal nights/year you'd use a house | trips/yr × nights/trip (≈ how much you already travel there) | 16 |
| Rental nightly rate (if renting it out) | the same local comps you've been paying | ~$175 |

The two cadence-dependent ones (trips/year, personal nights/year) are gated at 3+ confirmed trips, since one or two trips don't establish a pattern. Seeded values are rounded to each slider's step so the thumb lands exactly on the value. These are *starting points*, not locks — every one is an ordinary editable slider, and the "adjusted" dot on a tab compares against these history-informed defaults (not the raw code defaults), so a dot always means "you changed this from the starting scenario."

**How trips/year is measured:** it's the trip count divided by the *elapsed window* the trips actually span (first check-in to last check-out), not by the number of distinct calendar years they touch. Counting calendar years badly undercounts the cadence when the first and last years are only partially covered — these 5 trips run Dec 2023 → May 2026 and touch 4 calendar years, which would read as a misleading 1.25 trips/yr, when the real pace across that ~2.4-year window is ~2.1/yr. The elapsed-window figure (~2.1/yr, ~$2,900/yr of Airbnb spend at the current nightly-rate default) is what feeds the model.

### Refreshing the historical dataset

This is not a live integration — refreshing means re-running a Gmail search and hand-editing the JSON, the same pattern used for other trackers built on this account (e.g. a ticket-purchase tracker that works the same way). To pull in new trips:

1. **Search broad, then filter by distance — don't search by destination keyword.** The area around Edgerton doesn't have one town name to search for; people book Airbnbs in whichever nearby town has a listing, which for this account has included Bryan/Hicksville OH *and* Auburn/Fort Wayne/Avilla IN — all roughly an hour's drive of Edgerton in different directions. Searching for "Edgerton" or a couple of known Ohio town names will miss real trips (this happened on the first pass at this dataset). Instead, pull every new-reservation confirmation email since the last recorded trip:
   ```
   from:(automated@airbnb.com OR express@airbnb.com) (subject:"You're all set for" OR subject:"Confirmed: Your" OR subject:"Reservation confirmed for") after:<last-trip-checkout-date>
   ```
   (Airbnb has used more than one confirmation-email subject template over time — the query above covers the ones seen so far. If a refresh turns up a trip with a subject that doesn't match any of these, add the new pattern to this list.)
2. For each result, open the email and check the destination address against a map — is it within about an hour of Edgerton? Discard anything that isn't.
3. For everything that is, check for a matching post-stay email in the same thread or nearby in time — subject lines like *"Write a review for \<host\>"* or *"\<host\> shared a review of your stay in \<city\>"*. Only trips with both a confirmation and a review count as confirmed. If a "Reservation Canceled" email shows up for that confirmation code instead, it's a cancellation, not a trip.
4. Pull check-in/check-out dates, total price paid, nightly rate, cleaning fee (if broken out separately — many hosts don't), and the booking date from the confirmation/receipt email. If a reservation was later extended or modified, cross-check the review email's stated date range (e.g. "Dalen · Dec 24 – 30") against the original booking — it's often the more reliable source for the *actual* final dates than the modification-notice emails, which don't always restate the new checkout date.
5. Append a new entry to the `trips` array in `data/airbnb-history.json` (same shape as the existing entries, including the `confirmationEvidence` block with the Gmail thread IDs for both the booking and review emails, for auditability). Add cancelled or unreviewed bookings to `unconfirmedTrips` instead, with a `reason`.
6. Update `_meta.lastRefreshed`.
7. Commit the updated JSON. Nothing else needs to change — `history.js` re-aggregates on next page load.

The JSON is meant to be human-readable and hand-editable: if a record needs correcting (e.g. a price was mis-parsed), just edit it directly.

## Modeling notes & simplifications

Kept intentionally out of scope, per the project brief:

- **No full tax-return modeling.** The mortgage-interest/property-tax deduction and rental-income tax are both flat-rate approximations (`marginalTaxRate` × deductible amount, `rentalIncomeTaxRate` × net rental income) — no standard-deduction crowd-out, no SALT cap, no depreciation/Schedule E line items.
- **No live data feeds.** Purchase price, comps, and market assumptions are inputs you set, not something pulled from Zillow/Airbnb APIs. This is a planning tool, not a scraper.
- **No accounts, no server.** State lives entirely in the URL query string.

A couple of modeling choices worth knowing about if you're extending `model.js`:

- **"Net cost after resale" = cumulative cash outflow − recoverable value**, and the recoverable value is a complete "invest the difference" opportunity-cost model, not just the down-payment lump. For Buy, recoverable value is home equity if sold (appreciated value − selling costs − remaining loan) plus a side fund of any years where owning cost *less* than Airbnb-ing, invested at the alternative return. For Airbnb, it's a side fund seeded with the upfront cash the buyer would tie up (down payment + closing + furnishing) *and* fed each year with the difference between what owning would have cost and what the trips cost — every dollar the Airbnb-er saves by not carrying a house, compounding at the alternative-investment return. Breakeven is where the two net-cost lines cross. (An earlier version credited only the upfront lump and ignored the annual savings, which understated the Airbnb path's lead by the compounded value of those savings — often roughly halving the true gap. See the `sideFund` tracking in `runModel` and the opportunity-cost test in `tests/model.test.js`.)
- **The "Cash out of pocket" view is untouched by any of that** — it's pure nominal cash leaving your account each year, no investment returns, no resale credit. That's the default view and the summary card's headline numbers.
- **Rental income** uses booked nights = listed nights × occupancy for *both* revenue and turnover-cleaning cost, so a low-occupancy year doesn't get charged cleaning for stays that never happened. Turnover assumes an average 3-night stay (`ASSUMED_RENTAL_STAY_NIGHTS`) to convert booked nights into number of stays.
- **A cash purchase can lose to Airbnb purely on opportunity cost.** Paying 100% cash ties up far more capital than a mortgage's down payment does; invested at a healthy alternative return, that foregone growth is a real cost of buying. At a modest travel level the tied-up-capital opportunity cost means an all-cash buy never catches up — see the `runModel` tests in `tests/model.test.js`.
