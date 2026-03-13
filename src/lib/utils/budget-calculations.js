/**
 * Budget Calculation Engine
 *
 * Core formula:
 *   norms_per_unit × number_of_units = total_mandays
 *   total_mandays × (cost_per_month / working_days_per_month) = total_cost
 *
 * All calculations are pure functions with no side effects.
 */

/**
 * Calculate total mandays for a norm entry
 * @param {number} normsPerUnit - effort per unit in mandays
 * @param {number} numberOfUnits - total units
 * @returns {number} total mandays
 */
export function calculateTotalMandays(normsPerUnit, numberOfUnits) {
  const norms = parseFloat(normsPerUnit) || 0;
  const units = parseFloat(numberOfUnits) || 0;
  return norms * units;
}

/**
 * Calculate total cost for a norm entry
 * @param {number} totalMandays - total mandays required
 * @param {number} costPerMonth - monthly cost for the role
 * @param {number} workingDaysPerMonth - working days per month (default 20)
 * @returns {number} total cost
 */
export function calculateTotalCost(totalMandays, costPerMonth, workingDaysPerMonth = 20) {
  const mandays = parseFloat(totalMandays) || 0;
  const cost = parseFloat(costPerMonth) || 0;
  const days = parseFloat(workingDaysPerMonth) || 20;
  if (days === 0) return 0;
  return mandays * (cost / days);
}

/**
 * Calculate full norm values (mandays and cost)
 * @param {number} normsPerUnit
 * @param {number} numberOfUnits
 * @param {number} costPerMonth
 * @param {number} workingDaysPerMonth
 * @returns {{ totalMandays: number, totalCost: number }}
 */
export function calculateNorm(normsPerUnit, numberOfUnits, costPerMonth, workingDaysPerMonth = 20) {
  const totalMandays = calculateTotalMandays(normsPerUnit, numberOfUnits);
  const totalCost = calculateTotalCost(totalMandays, costPerMonth, workingDaysPerMonth);
  return { totalMandays, totalCost };
}

/**
 * Calculate line item total: sum of all norms' costs
 * @param {Array<{ totalCost: number }>} norms - array of norm calculations
 * @returns {number} line total
 */
export function calculateLineTotal(norms) {
  if (!Array.isArray(norms)) return 0;
  return norms.reduce((sum, norm) => sum + (parseFloat(norm.totalCost) || 0), 0);
}

/**
 * Calculate section subtotal: sum of all line item totals within a section
 * @param {Array<{ lineTotal: number }>} lineItems
 * @returns {number} section subtotal
 */
export function calculateSectionSubtotal(lineItems) {
  if (!Array.isArray(lineItems)) return 0;
  return lineItems.reduce((sum, item) => sum + (parseFloat(item.lineTotal) || 0), 0);
}

/**
 * Calculate budget total: sum of all section subtotals
 * @param {Array<{ subtotal: number }>} sections
 * @returns {number} budget total
 */
export function calculateBudgetTotal(sections) {
  if (!Array.isArray(sections)) return 0;
  return sections.reduce((sum, section) => sum + (parseFloat(section.subtotal) || 0), 0);
}

/**
 * Format a number as INR currency
 * @param {number} amount
 * @returns {string} formatted string like "₹12,34,567"
 */
export function formatCurrency(amount, currency = 'INR') {
  const num = parseFloat(amount) || 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: currency,
    maximumFractionDigits: 0,
  }).format(num);
}

/**
 * Format a number with 2 decimal places
 * @param {number} num
 * @returns {string}
 */
export function formatNumber(num) {
  const val = parseFloat(num) || 0;
  return val % 1 === 0 ? val.toString() : val.toFixed(2);
}

/**
 * Recalculate all values for a complete budget structure
 * @param {Object} budget - full budget object with sections, lineItems, norms, roles
 * @returns {Object} recalculated budget with updated totals
 */
export function recalculateBudget(budget) {
  const { sections, roles, workingDaysPerMonth = 20 } = budget;

  const roleMap = {};
  if (Array.isArray(roles)) {
    roles.forEach((role) => {
      roleMap[role.id] = role;
    });
  }

  let budgetTotal = 0;

  const recalculatedSections = (sections || []).map((section) => {
    let sectionSubtotal = 0;

    const recalculatedLineItems = (section.lineItems || []).map((lineItem) => {
      const numberOfUnits = parseFloat(lineItem.numberOfUnits) || 0;

      const recalculatedNorms = (lineItem.norms || []).map((norm) => {
        const role = roleMap[norm.roleId];
        const costPerMonth = role ? parseFloat(role.costPerMonth) || 0 : 0;
        const { totalMandays, totalCost } = calculateNorm(
          norm.normsPerUnit,
          numberOfUnits,
          costPerMonth,
          workingDaysPerMonth
        );
        return { ...norm, totalMandays, totalCost };
      });

      const lineTotal = calculateLineTotal(recalculatedNorms);
      sectionSubtotal += lineTotal;

      return { ...lineItem, norms: recalculatedNorms, lineTotal };
    });

    budgetTotal += sectionSubtotal;

    return { ...section, lineItems: recalculatedLineItems, subtotal: sectionSubtotal };
  });

  return {
    ...budget,
    sections: recalculatedSections,
    totalEstimatedBudget: budgetTotal,
  };
}
