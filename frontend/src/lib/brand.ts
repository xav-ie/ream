// Single source of truth for the ream coil-spring mark. Both the inline
// wordmark (components/brandmark.astro) and the favicon (pages/favicon.svg.ts)
// render from springMark() so the geometry never drifts between the two.
// .github/logo.svg (the README) is a static copy; update it with the mark.

// Three rings, drawn as alternating half-ellipses descending the icon.
const PATH =
  'M9 6 A7 3 0 0 0 23 10 A7 3 0 0 1 9 14 A7 3 0 0 0 23 18 A7 3 0 0 1 9 22 A7 3 0 0 0 23 26';

const STOP_TOP = '#7be35a';
const STOP_BOTTOM = '#51d136';

interface SpringOptions {
  /** Class applied to the root <svg> (inline mark only). */
  className?: string;
}

export function springMark({ className }: SpringOptions = {}) {
  const cls = className ? ` class="${className}"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg"${cls} viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="${PATH}" stroke="url(#spring)" stroke-width="2.4" stroke-linecap="round" /><defs><linearGradient id="spring" x1="9" y1="6" x2="23" y2="26" gradientUnits="userSpaceOnUse"><stop stop-color="${STOP_TOP}" /><stop offset="1" stop-color="${STOP_BOTTOM}" /></linearGradient></defs></svg>`;
}
