// Apply the fixed 12x relationship between monthly and annual cost.
// Returns a patch that sets the edited field AND derives its partner
// (monthly * 12 or annual / 12, rounded to cents). Empty / non-positive
// input leaves the partner untouched so the user can backspace to edit
// without wiping the other field.
export function applyCostRatio(
  field: 'cost_monthly' | 'cost_annual',
  raw: string,
): Record<string, string | number> {
  const patch: Record<string, string | number> = { [field]: raw };
  const n = Number(raw);
  if (raw !== '' && Number.isFinite(n) && n > 0) {
    const other = field === 'cost_monthly' ? 'cost_annual' : 'cost_monthly';
    const derived = field === 'cost_monthly' ? n * 12 : n / 12;
    patch[other] = Math.round(derived * 100) / 100;
  }
  return patch;
}
