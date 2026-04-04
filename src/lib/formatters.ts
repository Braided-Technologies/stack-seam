/**
 * Format a number with commas: 30000 → "30,000"
 */
export function formatNumber(n: number | null | undefined): string {
  if (n == null) return '';
  return n.toLocaleString('en-US');
}

/**
 * Format as currency: 30000 → "$30,000"
 */
export function formatCurrency(n: number | null | undefined): string {
  if (n == null || n === 0) return '';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 });
}

/**
 * Compact number: 30000 → "30k", 4200 → "4.2k", 1500000 → "1.5M"
 */
export function formatCompact(n: number | null | undefined): string {
  if (n == null) return '0';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) {
    const v = n / 1_000_000;
    return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}M`;
  }
  if (abs >= 1_000) {
    const v = n / 1_000;
    return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}k`;
  }
  return n.toString();
}

/**
 * Compact currency: 30000 → "$30k"
 */
export function formatCompactCurrency(n: number | null | undefined): string {
  if (n == null) return '$0';
  return `$${formatCompact(n)}`;
}
