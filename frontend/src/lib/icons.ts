// Line icons (24×24, currentColor) for each tool action, keyed by slug. The
// site (components/icon.astro) and the README diagram (scripts/diagrams.mjs)
// both draw from here.
export const icons: Record<string, string> = {
  merge: `<path d="M6 5v4c0 2 1.4 3 3.5 3H17" /><path d="M6 19v-4c0-2 1.4-3 3.5-3" /><path d="M14 9l3 3-3 3" />`,
  reorder: `<path d="M8 4v16" /><path d="M5 7l3-3 3 3" /><path d="M16 20V4" /><path d="M13 17l3 3 3-3" />`,
  split: `<circle cx="6" cy="6" r="2" /><circle cx="6" cy="18" r="2" /><line x1="20" y1="4" x2="8.1" y2="15.9" /><line x1="14.5" y1="13.5" x2="20" y2="20" /><line x1="8.1" y1="8.1" x2="12" y2="12" />`,
  compress: `<path d="M8 5l4 4 4-4" /><path d="M8 19l4-4 4 4" /><line x1="4" y1="12" x2="20" y2="12" />`,
  'images-to-pdf': `<rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="10" r="1.6" /><path d="M21 15l-4.5-4.5L7 20" />`,
  'pdf-to-images': `<rect x="3" y="3" width="7.5" height="7.5" rx="1" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="1" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="1" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1" />`,
  'office-to-pdf': `<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><line x1="9" y1="13" x2="15" y2="13" /><line x1="9" y1="17" x2="13" y2="17" />`,
};
