/**
 * Salary Tax Calculator Service (2026 Tax Law)
 * 
 * Implements the new Personal Income Tax (PIT) logic effective Jan 1, 2026.
 * Key changes:
 * - Removal of Consolidated Relief Allowance (CRA)
 * - New Rent Relief: 20% of rent paid, capped at ₦500k.
 * - Tax-free allowance: First ₦800k.
 * - Progressive Revised Tax Bands.
 */

// Tax Bands Configuration
const TAX_BANDS = [
    { threshold: 800000, rate: 0.00 },        // First 800k @ 0%
    { threshold: 3000000, rate: 0.15 },       // Next 2.2M (up to 3M) @ 15%
    { threshold: 12000000, rate: 0.18 },      // Next 9M (up to 12M) @ 18%
    { threshold: 25000000, rate: 0.21 },      // Next 13M (up to 25M) @ 21%
    { threshold: 50000000, rate: 0.23 },      // Next 25M (up to 50M) @ 23%
    { threshold: Infinity, rate: 0.25 }       // Above 50M @ 25%
];

/**
 * Calculate the allowable rent relief.
 * Rule: 20% of annual rent paid, capped at ₦500,000.
 * @param {number} annualRent - Total annual rent paid
 * @returns {number} - Allowable relief amount
 */
function calculateRentRelief(annualRent) {
    if (!annualRent || annualRent < 0) return 0;
    const relief = annualRent * 0.20;
    return Math.min(relief, 500000);
}

/**
 * Calculate total annual tax liability based on progressive bands.
 * @param {number} taxableIncome - Income after all deductions
 * @returns {object} - { totalTax, breakdown }
 */
function calculateTaxLiability(taxableIncome) {
    let remainingIncome = taxableIncome;
    let totalTax = 0;
    let breakdown = [];
    let previousThreshold = 0;

    for (const band of TAX_BANDS) {
        if (remainingIncome <= 0) break;

        const bandWidth = band.threshold === Infinity
            ? remainingIncome
            : band.threshold - previousThreshold;

        const taxableAmount = Math.min(remainingIncome, bandWidth);
        const taxForBand = taxableAmount * band.rate;

        if (taxableAmount > 0) {
            breakdown.push({
                rate: band.rate,
                taxableAmount,
                tax: taxForBand
            });
            totalTax += taxForBand;
            remainingIncome -= taxableAmount;
        }

        previousThreshold = band.threshold;
    }

    return { totalTax, breakdown };
}

/**
 * Main Calculator Function
 * @param {object} inputs
 * @param {number} inputs.grossIncome - Annual gross income
 * @param {number} inputs.annualRent - Annual rent paid (optional)
 * @param {number} inputs.pension - Annual pension contribution (optional)
 * @param {number} inputs.nhf - National Housing Fund contribution (optional)
 * @param {number} inputs.nhis - Health Insurance contribution (optional)
 * @param {number} inputs.lifeAssurance - Life insurance premium (optional)
 * 
 * @returns {object} Calculation result
 */
function calculateAnnualTax(inputs) {
    const {
        grossIncome,
        annualRent = 0,
        pension = 0,
        nhf = 0,
        nhis = 0,
        lifeAssurance = 0
    } = inputs;

    // 1. Calculate Deductions
    const rentRelief = calculateRentRelief(annualRent);
    const statutoryDeductions = pension + nhf + nhis + lifeAssurance;
    const totalReliefs = rentRelief + statutoryDeductions;

    // 2. Calculate Taxable Income
    // Ensure taxable income doesn't drop below zero
    const taxableIncome = Math.max(0, grossIncome - totalReliefs);

    // 3. Calculate Tax
    const taxResult = calculateTaxLiability(taxableIncome);

    return {
        grossIncome,
        deductions: {
            rentRelief,
            statutoryDeductions,
            totalReliefs
        },
        taxableIncome,
        totalAnnualTax: taxResult.totalTax,
        monthlyTax: taxResult.totalTax / 12,
        taxBreakdown: taxResult.breakdown,
        effectiveTaxRate: (taxResult.totalTax / grossIncome) * 100
    };
}

/**
 * Calculates tax for a monthly income by annualizing it.
 * Assumptions:
 * - Monthly salary * 12 = Annual Gross
 * - Monthly rent * 12 = Annual Rent
 * @param {object} monthlyInputs 
 */
function calculateFromMonthly(monthlyInputs) {
    const annualInputs = {
        grossIncome: monthlyInputs.monthlyGross * 12,
        annualRent: (monthlyInputs.monthlyRent || 0) * 12,
        pension: (monthlyInputs.monthlyPension || 0) * 12,
        nhf: (monthlyInputs.monthlyNhf || 0) * 12,
        nhis: (monthlyInputs.monthlyNhis || 0) * 12,
        lifeAssurance: (monthlyInputs.monthlyLifeAssurance || 0) * 12
    };

    return calculateAnnualTax(annualInputs);
}

module.exports = {
    calculateRentRelief,
    calculateTaxLiability,
    calculateAnnualTax,
    calculateFromMonthly
};
