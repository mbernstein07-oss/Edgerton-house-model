// The "How this works" content, rendered into a modal from the toolbar.
// Kept as one self-contained HTML string so there's a single source of truth
// for the explanation; ui.js just drops it into the dialog.

export const HELP_TITLE = "How this works";

export const HELP_HTML = `
  <p class="help-lead">This tool answers one question: over the next several years, is buying a house near Edgerton, Ohio actually cheaper than continuing to book Airbnbs for your trips there? Everything recalculates live as you change inputs, and the URL updates so any scenario can be shared as a link.</p>

  <h3>The two paths it compares</h3>
  <ul>
    <li><strong>Keep Airbnb-ing</strong> — you book trips as you do now. The only cost is what you pay per trip, growing each year at the Airbnb price-growth rate.</li>
    <li><strong>Own the house</strong> — you put money down (or pay cash), then carry the place every year: mortgage, property tax, insurance, maintenance, utilities, minus any rental income if you rent it out when you're not there.</li>
  </ul>

  <h3>The chart has two views — they answer different questions</h3>
  <p><strong>Cash out of pocket</strong> (the default) is the literal-dollars view: every dollar that actually leaves your account on each path, added up year by year. Buying almost always sits far above Airbnb-ing here, because a house costs far more per year to carry than a few trips cost to book. This view does <em>not</em> count that the house is worth something when you eventually sell — it's pure cash flow.</p>
  <p><strong>Cost after resale</strong> is the full economic comparison, and it's where "does buying pay off?" is actually decided. It credits each path with what you'd have to show for your money at the end:</p>
  <ul>
    <li>The <strong>house</strong> is credited with its resale value — the appreciated price, minus selling costs, minus whatever's left on the loan.</li>
    <li>The <strong>Airbnb path</strong> is credited with investment growth on the money you <em>didn't</em> spend on a house. That's two things: the big upfront sum you'd have tied up (down payment + closing + furnishing), <em>and</em> the difference every year between what owning would cost and what your trips cost — money the Airbnb-er can invest instead. Both grow at your "alternative investment return."</li>
  </ul>
  <p>On this view, where the two lines cross is the <strong>breakeven year</strong>. A line dipping below zero means that path has come out ahead in total.</p>

  <h3>The summary card (top right)</h3>
  <p>It leads with the headline verdict, then the head-to-head: average cash per year on each path (averaged across the whole time horizon, so changing the growth rate or horizon actually moves it), the one-time upfront cash to buy, and the totals over the horizon. The italic line underneath is the after-resale bottom line — how far ahead or behind owning ends up once resale value and investment growth are counted.</p>

  <h3>"Where every dollar goes"</h3>
  <p>Under the summary is the full itemized breakdown — two receipts, one per path, each line a real total over the horizon that moves with your inputs. Rather than tell you why the verdict comes out the way it does, it shows you: you can read straight down and see that owning's cost is mostly carrying costs (mortgage, tax, maintenance) with a smaller resale credit, while Airbnb-ing's "cost" often goes negative because the cash you'd never tie up in a house grows so much. Costs are money out; green figures are money back or investment growth you'd keep. Each receipt subtotals to "cash out of pocket" (the first chart view) and then to "net cost after resale" (the second) — the same totals the chart plots, so the receipt can never disagree with it.</p>

  <h3>The Sensitivity table</h3>
  <p>Shows how the outcome shifts if a key assumption comes in higher or lower than you set it — home appreciation, your alternative investment return, the mortgage rate, and (if you rent it out) occupancy. The shaded middle column is your current setting. Each cell shows either the breakeven year or, if it doesn't break even, how many dollars behind it ends — so you can see which direction and how much each lever actually moves things. If nothing in the table reaches breakeven, the biggest levers are elsewhere: purchase price, cash vs. mortgage, and whether you rent it out.</p>

  <h3>Where the starting numbers come from</h3>
  <p>The Airbnb baseline isn't guessed — it's seeded from your real trip history (confirmed Airbnb stays within about an hour of Edgerton, pulled from Gmail). That sets the default nightly rate, nights per trip, trips per year, how many nights a year you'd likely use a house, and a comparable rental rate. All of them remain ordinary sliders you can override; the underlying trips are listed on the <strong>Trip history</strong> tab.</p>

  <h3>Saving scenarios</h3>
  <p>The <strong>Scenarios</strong> tab lets you name and save a full set of inputs — "Cash, personal use only" vs. "Mortgage, rent when vacant" — and reload any of them with one click, so you can line up a few setups without re-dialing every slider. They're saved in this browser only; use a scenario's "Copy link" to send one to someone else.</p>

  <h3>Assumptions and simplifications — worth knowing before you trust a number</h3>
  <ul>
    <li><strong>Taxes are approximate.</strong> The mortgage-interest / property-tax deduction and rental-income tax are flat-rate estimates, not a real tax return — no standard-deduction comparison, no SALT cap, no depreciation.</li>
    <li><strong>The after-resale comparison is an "invest the difference" model.</strong> It assumes the money you save by not owning actually gets invested at your alternative-investment return. If in reality you'd just spend it, owning looks better than this view suggests.</li>
    <li><strong>Rental income</strong> uses the nights you'd list × your occupancy assumption for booked nights, then subtracts management fee, platform fee, and per-stay turnover cleaning. Utilities are charged year-round regardless of rental.</li>
    <li><strong>Insurance, HOA, and utilities</strong> are held flat over time; property tax and maintenance rise with the home's value.</li>
    <li><strong>PMI</strong> (if your down payment is under 20%) drops off once the loan is paid down to 78% of the original price.</li>
    <li><strong>Home appreciation and Airbnb price growth</strong> are steady annual rates, not real-world ups and downs.</li>
  </ul>
  <p class="help-disclaimer">This is a planning tool to pressure-test assumptions, not financial advice. The answer it gives is only as good as the inputs you feed it — so try a few scenarios rather than trusting a single number.</p>
`;
