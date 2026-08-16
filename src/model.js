// Pure calculation functions for the Buy vs. Airbnb model.
// No DOM access anywhere in this file — inputs in, plain data out.

export const DEFAULT_INPUTS = {
  // A. Airbnb baseline (status quo)
  airbnbNightlyRate: 210,
  airbnbCleaningFee: 0,
  airbnbTripsPerYear: 3,
  airbnbNightsPerTrip: 7,
  airbnbGrowthRate: 0.04,

  // B. Purchase
  purchasePrice: 200000,
  financing: "mortgage", // "cash" | "mortgage"
  downPaymentPct: 0.20,
  interestRate: 0.065,
  loanTermYears: 30,
  pmiRateAnnual: 0.005,
  closingCostPct: 0.025,
  furnishingCost: 15000,

  // C. Ongoing ownership costs
  propertyTaxRate: 0.015,
  insuranceAnnual: 1400,
  hoaAnnual: 0,
  maintenancePct: 0.012,
  utilitiesVacantMonthly: 150,

  // D. Usage & offset
  personalNightsPerYear: 21,
  usageMode: "personal", // "personal" | "rental"
  rentalNightsPerYear: 60,
  rentalNightlyRate: 180,
  occupancyRate: 0.5,
  propertyMgmtFeePct: 0.20,
  turnoverCostPerStay: 75,
  platformFeePct: 0.03,
  tripsReplacedPct: 1.0,

  // F. Financial comparison
  horizonYears: 10,
  altInvestmentReturn: 0.06,
  homeAppreciationRate: 0.025,
  sellingCostPct: 0.075,
  marginalTaxRate: 0.22,
  itemizeDeductions: false,
  rentalIncomeTaxRate: 0.22,
};

// Assumed average length of a rented-out stay, used only to estimate how many
// turnovers/cleanings occur per year from rentalNightsPerYear. Not exposed as
// an input to keep the form from ballooning; a reasonable weekend-getaway default.
const ASSUMED_RENTAL_STAY_NIGHTS = 3;

const PMI_REMOVAL_LTV = 0.78; // PMI drops once balance <= 78% of original price

export function monthlyMortgagePayment(loanAmount, annualRate, termYears) {
  if (loanAmount <= 0) return 0;
  const n = termYears * 12;
  const r = annualRate / 12;
  if (r === 0) return loanAmount / n;
  return (loanAmount * r) / (1 - Math.pow(1 + r, -n));
}

// Returns a year-by-year (1-indexed) amortization summary out to horizonYears.
// Payments stop once the loan term ends or the balance is paid off.
export function amortizationYearly(loanAmount, annualRate, termYears, purchasePrice, pmiRateAnnual, horizonYears) {
  const monthlyRate = annualRate / 12;
  const n = termYears * 12;
  const payment = monthlyMortgagePayment(loanAmount, annualRate, termYears);
  let balance = loanAmount;
  const years = [];

  for (let year = 1; year <= horizonYears; year++) {
    let interestPaid = 0;
    let principalPaid = 0;
    let pmiPaid = 0;

    for (let m = 1; m <= 12; m++) {
      const monthIndex = (year - 1) * 12 + m;
      if (monthIndex > n || balance <= 0.005) break;

      const interest = balance * monthlyRate;
      let principal = payment - interest;
      if (principal > balance) principal = balance;
      balance -= principal;

      interestPaid += interest;
      principalPaid += principal;

      if (pmiRateAnnual > 0 && balance > PMI_REMOVAL_LTV * purchasePrice) {
        pmiPaid += (pmiRateAnnual / 12) * balance;
      }
    }

    years.push({
      year,
      interestPaid,
      principalPaid,
      paymentTotal: interestPaid + principalPaid,
      pmiPaid,
      endingBalance: balance,
    });
  }

  return years;
}

export function airbnbAnnualCost(inputs, yearIndex) {
  const growth = Math.pow(1 + inputs.airbnbGrowthRate, yearIndex - 1);
  const perTrip = inputs.airbnbNightlyRate * growth * inputs.airbnbNightsPerTrip + inputs.airbnbCleaningFee * growth;
  return perTrip * inputs.airbnbTripsPerYear;
}

function rentalIncomeForYear(inputs, yearIndex) {
  if (inputs.usageMode !== "rental") {
    return { gross: 0, mgmtFee: 0, platformFee: 0, turnoverCost: 0, net: 0, tax: 0 };
  }
  const growth = Math.pow(1 + inputs.airbnbGrowthRate, yearIndex - 1);
  const gross = inputs.rentalNightlyRate * growth * inputs.rentalNightsPerYear * inputs.occupancyRate;
  const mgmtFee = gross * inputs.propertyMgmtFeePct;
  const platformFee = gross * inputs.platformFeePct;
  const numStays = inputs.rentalNightsPerYear / ASSUMED_RENTAL_STAY_NIGHTS;
  const turnoverCost = inputs.turnoverCostPerStay * numStays;
  const net = gross - mgmtFee - platformFee - turnoverCost;
  const tax = Math.max(0, net) * inputs.rentalIncomeTaxRate;
  return { gross, mgmtFee, platformFee, turnoverCost, net, tax };
}

// Builds the full year-by-year series (year 0 = purchase/decision moment) and
// derives the headline breakeven year + horizon totals.
export function runModel(inputs) {
  const horizon = inputs.horizonYears;
  const isCash = inputs.financing === "cash";

  const downPaymentAmount = isCash ? inputs.purchasePrice : inputs.purchasePrice * inputs.downPaymentPct;
  const loanAmount = isCash ? 0 : inputs.purchasePrice - downPaymentAmount;
  const closingCosts = inputs.purchasePrice * inputs.closingCostPct;
  const upfrontCash = downPaymentAmount + closingCosts + inputs.furnishingCost;

  const pmiApplies = !isCash && inputs.downPaymentPct < 0.20;
  const amort = isCash
    ? []
    : amortizationYearly(loanAmount, inputs.interestRate, inputs.loanTermYears, inputs.purchasePrice, pmiApplies ? inputs.pmiRateAnnual : 0, horizon);

  const years = [];
  let cumulativeBuyOutflow = upfrontCash;
  let cumulativeAirbnbSpend = 0;

  // Year 0 row: nothing has happened yet except the upfront cash commitment.
  years.push({
    year: 0,
    buy: {
      annualCashOutflow: 0,
      homeValue: inputs.purchasePrice,
      loanBalance: loanAmount,
      equityIfSold: inputs.purchasePrice * (1 - inputs.sellingCostPct) - loanAmount,
      cumulativeCashOutflow: cumulativeBuyOutflow,
      netCost: cumulativeBuyOutflow - (inputs.purchasePrice * (1 - inputs.sellingCostPct) - loanAmount),
    },
    airbnb: {
      annualCost: 0,
      cumulativeCost: 0,
      investedBalance: upfrontCash,
      netCost: 0 - upfrontCash,
    },
  });

  for (let i = 1; i <= horizon; i++) {
    const homeValueStart = inputs.purchasePrice * Math.pow(1 + inputs.homeAppreciationRate, i - 1);
    const homeValueEnd = inputs.purchasePrice * Math.pow(1 + inputs.homeAppreciationRate, i);
    const yearAmort = isCash ? { interestPaid: 0, principalPaid: 0, paymentTotal: 0, pmiPaid: 0, endingBalance: 0 } : amort[i - 1];

    const propertyTax = inputs.propertyTaxRate * homeValueStart;
    const maintenance = inputs.maintenancePct * homeValueStart;
    const utilities = inputs.utilitiesVacantMonthly * 12;
    const ownershipCosts = yearAmort.paymentTotal + yearAmort.pmiPaid + propertyTax + inputs.insuranceAnnual + inputs.hoaAnnual + maintenance + utilities;

    const rental = rentalIncomeForYear(inputs, i);
    const residualAirbnbCost = airbnbAnnualCost(inputs, i) * (1 - inputs.tripsReplacedPct);

    const deductible = yearAmort.interestPaid + propertyTax;
    const taxBenefit = !isCash && inputs.itemizeDeductions ? deductible * inputs.marginalTaxRate : (isCash && inputs.itemizeDeductions ? propertyTax * inputs.marginalTaxRate : 0);

    const annualCashOutflow = ownershipCosts - rental.net + rental.tax + residualAirbnbCost - taxBenefit;
    cumulativeBuyOutflow += annualCashOutflow;

    const equityIfSold = homeValueEnd * (1 - inputs.sellingCostPct) - yearAmort.endingBalance;
    const buyNetCost = cumulativeBuyOutflow - equityIfSold;

    const annualAirbnb = airbnbAnnualCost(inputs, i);
    cumulativeAirbnbSpend += annualAirbnb;
    const investedBalance = upfrontCash * Math.pow(1 + inputs.altInvestmentReturn, i);
    const airbnbNetCost = cumulativeAirbnbSpend - investedBalance;

    years.push({
      year: i,
      buy: {
        annualCashOutflow,
        propertyTax,
        maintenance,
        utilities,
        insurance: inputs.insuranceAnnual,
        hoa: inputs.hoaAnnual,
        mortgagePayment: yearAmort.paymentTotal,
        interestPaid: yearAmort.interestPaid,
        principalPaid: yearAmort.principalPaid,
        pmiPaid: yearAmort.pmiPaid,
        rentalIncomeNet: rental.net,
        rentalIncomeTax: rental.tax,
        residualAirbnbCost,
        taxBenefit,
        homeValue: homeValueEnd,
        loanBalance: yearAmort.endingBalance,
        equityIfSold,
        cumulativeCashOutflow: cumulativeBuyOutflow,
        netCost: buyNetCost,
      },
      airbnb: {
        annualCost: annualAirbnb,
        cumulativeCost: cumulativeAirbnbSpend,
        investedBalance,
        netCost: airbnbNetCost,
      },
    });
  }

  let breakevenYear = null;
  for (const row of years) {
    if (row.year === 0) continue;
    if (row.buy.netCost <= row.airbnb.netCost) {
      breakevenYear = row.year;
      break;
    }
  }

  const last = years[years.length - 1];

  return {
    inputs,
    years,
    upfrontCash,
    downPaymentAmount,
    loanAmount,
    closingCosts,
    pmiApplies,
    breakevenYear,
    summary: {
      buyNetCostAtHorizon: last.buy.netCost,
      airbnbNetCostAtHorizon: last.airbnb.netCost,
      buyMinusAirbnbAtHorizon: last.buy.netCost - last.airbnb.netCost,
    },
  };
}

// Runs the model across a small grid of values for one lever, holding
// everything else fixed, and reports the resulting breakeven year for each —
// plus the net-cost gap at the horizon (buy minus Airbnb; negative = buying
// ahead), so a lever that never reaches breakeven still shows whether it's
// closing the gap or widening it.
export function sensitivitySweep(inputs, lever, values) {
  return values.map((value) => {
    const result = runModel({ ...inputs, [lever]: value });
    return { value, breakevenYear: result.breakevenYear, gapAtHorizon: result.summary.buyMinusAirbnbAtHorizon };
  });
}
