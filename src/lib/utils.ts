import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Return a safe URL for use as an anchor href. Blocks javascript:, data:,
 * vbscript:, and file: schemes that could execute script on click. Accepts
 * http(s), mailto, and relative URLs. Falls back to '#' for anything else.
 *
 * Use this anywhere a URL comes from user input or scraped content
 * (applications.vendor_url, integrations.documentation_url, etc.) before
 * rendering it as <a href={...}>.
 */
export function safeHref(url: string | null | undefined): string {
  if (!url) return '#';
  const trimmed = url.trim();
  if (!trimmed) return '#';
  // Allow relative URLs (anchors, paths, query strings)
  if (trimmed.startsWith('/') || trimmed.startsWith('#') || trimmed.startsWith('?')) return trimmed;
  try {
    const parsed = new URL(trimmed);
    const scheme = parsed.protocol.toLowerCase();
    if (scheme === 'http:' || scheme === 'https:' || scheme === 'mailto:') {
      return trimmed;
    }
    return '#';
  } catch {
    // Not a parseable URL — if it looks like a bare domain, assume https
    if (/^[a-z0-9.-]+\.[a-z]{2,}/i.test(trimmed) && !trimmed.includes(':')) {
      return 'https://' + trimmed;
    }
    return '#';
  }
}
