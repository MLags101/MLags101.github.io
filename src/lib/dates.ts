/**
 * Date formatting. Content dates are month-precision ("2025-06") and parse as UTC
 * midnight, so everything here formats in UTC — otherwise US time zones would render
 * "2025-06" as "May 2025".
 */
const monthYearFmt = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });

/** "Jun 2025" */
export const monthYear = (d: Date) => monthYearFmt.format(d);

/** "2025.06" — the monospace readout style used throughout the UI. */
export const mono = (d: Date) => `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

export const year = (d: Date) => d.getUTCFullYear();

const sameMonth = (a: Date, b: Date) =>
  a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth();

/** "2025.06 — 2025.08", "2025.06 — Present", or "2025.06" for a single month. */
export function range(start: Date, end?: Date, style: 'mono' | 'text' = 'mono') {
  const f = style === 'mono' ? mono : monthYear;
  if (!end) return `${f(start)} — Present`;
  if (sameMonth(start, end)) return f(start);
  return `${f(start)} — ${f(end)}`;
}

/** Whole months between two dates, inclusive ("Jun–Aug" = 3). */
export function months(start: Date, end: Date = new Date()) {
  return (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth() + 1;
}

/** "3 mo", "1 yr 2 mo" */
export function duration(start: Date, end?: Date) {
  const m = months(start, end);
  const y = Math.floor(m / 12);
  const r = m % 12;
  return [y && `${y} yr`, r && `${r} mo`].filter(Boolean).join(' ') || '1 mo';
}

/** ISO string for <time datetime>. */
export const iso = (d: Date) => d.toISOString().slice(0, 7);
