import { defineConfig, presetWind3 } from 'unocss';

export default defineConfig({
  presets: [presetWind3()],
  theme: {
    colors: {
      bg: 'var(--bg)',
      panel: 'var(--panel)',
      border: 'var(--border)',
      text: 'var(--text)',
      muted: 'var(--muted)',
      accent: 'var(--accent)',
    },
  },
  shortcuts: {
    // The pill button used by every tool's submit and the home cards' CTA.
    btn: 'inline-flex items-center justify-center gap-2 rounded-md bg-accent text-[#12081a] font-600 px-4 py-2 cursor-pointer border-0 transition-colors hover:bg-[var(--accent-press)] disabled:opacity-50 disabled:cursor-default',
    card: 'block bg-panel border border-border rounded-xl p-5 no-underline text-text transition-colors hover:border-accent',
    field:
      'bg-bg text-text border border-border rounded-md px-3 py-2 text-sm w-full',
  },
});
