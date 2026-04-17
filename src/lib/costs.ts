// Apply the fixed 12x relationship between monthly and annual cost.
// Returns a patch that sets the edited field AND derives its partner
// (monthly * 12 or annual / 12, rounded to cents). Empty / non-positive
// input leaves the partner untouched so the user can backspace to edit
// without wiping the other field.
// Lenient parse: strip commas, spaces, currency symbols so pasted values like
// "$1,449.30" or "1 449,30" still resolve cleanly.
export function parseCostInput(raw: unknown): number {
  if (raw == null) return NaN;
  const s = String(raw).replace(/[\s$,]/g, '');
  return Number(s);
}

function deriveCostPair(
  monthlyKey: string,
  annualKey: string,
  field: string,
  raw: string,
): Record<string, string | number> {
  const patch: Record<string, string | number> = { [field]: raw };
  const n = parseCostInput(raw);
  if (raw !== '' && Number.isFinite(n) && n > 0) {
    const isMonthly = field === monthlyKey;
    const other = isMonthly ? annualKey : monthlyKey;
    const derived = isMonthly ? n * 12 : n / 12;
    patch[other] = Math.round(derived * 100) / 100;
  }
  return patch;
}

export function applyCostRatio(
  field: 'cost_monthly' | 'cost_annual',
  raw: string,
): Record<string, string | number> {
  return deriveCostPair('cost_monthly', 'cost_annual', field, raw);
}

export function applyInternalCostRatio(
  field: 'internal_cost_monthly' | 'internal_cost_annual',
  raw: string,
): Record<string, string | number> {
  return deriveCostPair('internal_cost_monthly', 'internal_cost_annual', field, raw);
}
