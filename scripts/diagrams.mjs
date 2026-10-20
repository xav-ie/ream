#!/usr/bin/env node
// Generates the README's diagrams from three sources:
//   docs/diagrams/palette.json      the colors: scribe's light and dark themes
//   frontend/src/lib/tools.ts       the tools: names, blurbs, inputs, outputs
//   frontend/src/lib/icons.ts       the tools' icons, as the site draws them
// It writes docs/diagrams/<name>.svg (light) and <name>-dark.svg, and fills the
// README's <!-- diagram:NAME --> … <!-- /diagram:NAME --> blocks with a
// <picture> holding both and the diagram's alt text.
// Run in `nix develop`: node scripts/diagrams.mjs
// CI runs it and fails if anything it writes differs from what's committed.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { icons } from "../frontend/src/lib/icons.ts";
import { tools } from "../frontend/src/lib/tools.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");
const write = (file, text) => writeFileSync(path.join(root, file), text);
const DIR = "docs/diagrams";
const palette = JSON.parse(read(`${DIR}/palette.json`));

// --- primitives -----------------------------------------------------------------
const W = 1062;
const SIZE = { title: 16, sub: 13.5, label: 13, mono: 12.5 };
const FONT = `-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif`;
const MONO = `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// One decimal keeps the files small and the diffs clean.
const n = (v) => Math.round(v * 10) / 10;
// Deterministic text width estimate, so layout needs no browser.
const textWidth = (s, size) => s.length * size * 0.54;
// Monospace glyphs run wider.
const monoWidth = (s, size) => s.length * size * 0.62;
// Greedy word wrap to a pixel width.
const wrap = (s, size, width) =>
  s.split(" ").reduce(
    (out, word) => {
      const last = out.at(-1);
      if (last && textWidth(`${last} ${word}`, size) > width) out.push(word);
      else out[out.length - 1] = last ? `${last} ${word}` : word;
      return out;
    },
    [""],
  );

// Themes apply through CSS classes, so every diagram body is written once.
// `key` marks ream's own parts; `box` is someone else's; `store` is the
// browser's storage.
const style = (c) => `<style>
  text { font-family: ${FONT}; fill: ${c.text}; }
  .bg { fill: ${c.bg}; }
  .box { fill: ${c.surface}; stroke: ${c.line}; stroke-width: 2; }
  .key { fill: ${c.rec}; fill-opacity: .12; stroke: ${c.rec}; stroke-width: 2.5; }
  .store { fill: ${c.surface}; stroke: ${c.border}; stroke-width: 2; stroke-dasharray: 7 5; }
  .frame { fill: ${c.surface}; stroke: ${c.line}; stroke-width: 1.5; }
  .title { font-size: ${SIZE.title}px; font-weight: 650; }
  .sub { font-size: ${SIZE.sub}px; fill: ${c.muted}; }
  .label { font-size: ${SIZE.label}px; font-weight: 550; fill: ${c.border}; }
  .mono { font-family: ${MONO}; font-size: ${SIZE.mono}px; }
  .edge { fill: none; stroke: ${c.border}; stroke-width: 2; marker-end: url(#arrow); }
  .tag { fill: ${c.bg}; }
  .head { fill: ${c.border}; }
  .tile { fill: ${c.rec}; fill-opacity: .14; }
  .icon * { fill: none; stroke: ${c.rec}; stroke-width: 1.75; stroke-linecap: round; stroke-linejoin: round; }
  .badge { fill: ${c.bg}; stroke: ${c.line}; stroke-width: 1.5; }
  .heading { font-size: 18px; font-weight: 700; }
</style>`;

const svg = (h, body) =>
  ["light", "dark"].map(
    (theme) =>
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${n(h)}" width="${W}" height="${n(h)}" role="img">` +
      `${style(palette[theme])}<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path class="head" d="M0 0L10 5L0 10z"/></marker></defs>` +
      `<rect class="bg" width="${W}" height="${n(h)}"/>${body}</svg>\n`,
  );

const text = (cls, x, y, s, anchor = "start") =>
  `<text class="${cls}" x="${n(x)}" y="${n(y)}"${anchor === "start" ? "" : ` text-anchor="${anchor}"`}>${esc(s)}</text>`;
const rect = (cls, x, y, w, h, r) =>
  `<rect class="${cls}" x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${r}"/>`;

// Lines of text centered on (x, y): the first as a title, the rest as subtitles.
const lines = (x, y, all) => {
  const height = all.reduce((sum, [, cls]) => sum + SIZE[cls] * 1.35, 0);
  let top = y - height / 2;
  return all
    .map(([s, cls]) => {
      top += SIZE[cls] * 1.35;
      return text(cls, x, top - SIZE[cls] * 0.35, s, "middle");
    })
    .join("");
};

// A box: kind is key (ream's parts), box (someone else's) or store. Subtitles
// wrap to the box; `mono` lines sit below them in a frame.
const box = ({ x, y, w, h, text: [title, ...subs], kind = "box", mono }) => {
  const all = [
    [title, "title"],
    ...subs.flatMap((s) => wrap(s, SIZE.sub, w - 24)).map((s) => [s, "sub"]),
  ];
  if (!mono)
    return rect(kind, x, y, w, h, 14) + lines(x + w / 2, y + h / 2, all);
  const fh = mono.length * 19 + 14;
  const top = y + h - fh - 14;
  return (
    rect(kind, x, y, w, h, 14) +
    lines(x + w / 2, y + (top - y) / 2 + 2, all) +
    rect("frame", x + 14, top, w - 28, fh, 8) +
    mono
      .map((s, i) =>
        text("mono", x + 26, top + 22 + i * 19, s).replace(
          "<text",
          '<text xml:space="preserve"',
        ),
      )
      .join("")
  );
};

// A label on a line, with a background so the line doesn't run through it.
const label = (x, y, s) => {
  const w = textWidth(s, SIZE.label) + 12;
  return (
    rect("tag", x - w / 2, y - 12, w, 19, 5) +
    text("label", x, y + 2, s, "middle")
  );
};

const arrow = (points) =>
  `<path class="edge" d="M${points.map(([x, y]) => `${n(x)} ${n(y)}`).join("L")}"/>`;

const at = (b) => ({
  top: [b.x + b.w / 2, b.y],
  bottom: [b.x + b.w / 2, b.y + b.h],
  left: [b.x, b.y + b.h / 2],
  right: [b.x + b.w, b.y + b.h / 2],
});

// --- diagrams --------------------------------------------------------------------
const KIND = { pdf: "PDF", images: "Images", office: "Office", zip: "ZIP" };
const bySlug = Object.fromEntries(tools.map((t) => [t.slug, t]));

// A tool's icon on a tinted tile, top-left at (x, y).
const icon = (slug, x, y, size = 40) =>
  rect("tile", x, y, size, size, 10) +
  `<svg class="icon" x="${n(x + size * 0.2)}" y="${n(y + size * 0.2)}" width="${n(size * 0.6)}" height="${n(size * 0.6)}" viewBox="0 0 24 24">${icons[slug]}</svg>`;

// A small rounded tag in monospace, left-aligned at x.
const badge = (x, y, s) => {
  const w = monoWidth(s, SIZE.mono) + 18;
  return rect("badge", x, y, w, 22, 6) + text("mono", x + 9, y + 15.5, s);
};

// A tool card: icon, name, blurb, and what goes in and comes out.
const card = (tool, x, y, w, h) =>
  rect("box", x, y, w, h, 14) +
  icon(tool.slug, x + 16, y + 16) +
  text("title", x + 68, y + 33, tool.title) +
  wrap(tool.blurb, SIZE.sub, w - 32)
    .map((s, i) => text("sub", x + 16, y + 78 + i * 18, s))
    .join("") +
  badge(x + 16, y + h - 38, `${KIND[tool.input]} → ${KIND[tool.output]}`);

// A tool in the chain row: icon and name.
const step = (tool, x, y, w, h) =>
  rect("key", x, y, w, h, 14) +
  icon(tool.slug, x + 14, y + (h - 36) / 2, 36) +
  text("title", x + 60, y + h / 2 + 5.5, tool.title);

const diagrams = {
  tools() {
    const gap = 20;
    const w = (W - 2 * 24 - 3 * gap) / 4;
    const h = 148;
    const top = 56;
    const cards = tools.map((tool, i) => {
      const row = Math.floor(i / 4);
      const inRow = row === 0 ? 4 : tools.length - 4;
      const left = (W - (inRow * w + (inRow - 1) * gap)) / 2;
      return card(
        tool,
        left + (i % 4) * (w + gap),
        top + row * (h + gap),
        w,
        h,
      );
    });

    // The chain: a Word file through three tools, each picking up the last result.
    const cy = top + 2 * h + gap + 92;
    const chain = ["office-to-pdf", "compress", "split"].map(
      (slug) => bySlug[slug],
    );
    const files = ["report.docx", "report.pdf", "compressed.pdf", "pages.zip"];
    const sh = 64;
    const lead = textWidth(files[0], SIZE.sub) + 46; // first file and its arrow
    const tail = textWidth(files.at(-1), SIZE.sub) + 46; // last arrow and file
    const link = 132; // between steps: "Continue with" and the file passed on
    const sw =
      (W - 2 * 24 - lead - tail - (chain.length - 1) * link) / chain.length;
    let x = 24;
    const parts = [text("sub", x, cy + sh / 2 + 5, files[0])];
    x += lead;
    chain.forEach((tool, i) => {
      if (i > 0) {
        parts.push(
          arrow([
            [x - link + 8, cy + sh / 2],
            [x - 6, cy + sh / 2],
          ]),
        );
        parts.push(label(x - link / 2, cy + sh / 2 - 22, "Continue with"));
        parts.push(
          text("mono", x - link / 2, cy + sh / 2 + 28, files[i], "middle"),
        );
      } else
        parts.push(
          arrow([
            [x - 34, cy + sh / 2],
            [x - 6, cy + sh / 2],
          ]),
        );
      parts.push(step(tool, x, cy, sw, sh));
      x += sw + link;
    });
    x -= link;
    parts.push(
      arrow([
        [x + 6, cy + sh / 2],
        [x + 28, cy + sh / 2],
      ]),
    );
    parts.push(text("sub", x + 36, cy + sh / 2 + 5, files.at(-1)));

    const body = [
      text("heading", 24, 36, "The tools"),
      ...cards,
      text(
        "heading",
        24,
        cy - 28,
        "Chain them: a result opens straight in the next tool",
      ),
      ...parts,
    ].join("");
    return {
      h: cy + sh + 40,
      body,
      alt:
        "ream's tools: " +
        tools
          .map(
            (t) =>
              `${t.title} (${KIND[t.input]} to ${KIND[t.output]}): ${t.blurb}`,
          )
          .join(" ") +
        ` Tools chain: ${files[0]} goes through ${chain.map((t) => t.title).join(", then ")}, each continuing with the last result, to ${files.at(-1)}.`,
    };
  },
};

// --- output ----------------------------------------------------------------------
let readme = read("README.md");
for (const [name, make] of Object.entries(diagrams)) {
  const { h, body, alt } = make();
  const [light, dark] = svg(h, body);
  write(`${DIR}/${name}.svg`, light);
  write(`${DIR}/${name}-dark.svg`, dark);
  const picture = [
    "<picture>",
    `  <source media="(prefers-color-scheme: dark)" srcset="${DIR}/${name}-dark.svg">`,
    `  <img src="${DIR}/${name}.svg" alt="${esc(alt).replace(/"/g, "&quot;")}">`,
    "</picture>",
  ].join("\n");
  readme = readme.replace(
    new RegExp(
      `(<!-- diagram:${name} -->)[\\s\\S]*?(<!-- /diagram:${name} -->)`,
    ),
    `$1\n${picture}\n$2`,
  );
}
write("README.md", readme);
