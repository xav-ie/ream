// Shared engine for the numbered, reorderable thumbnail grids. Items carry a
// stable number (1..N, assigned first-come on load); the user drags to reorder,
// ✕ to drop, ⧉ to duplicate, or types a sequence ("3,1,2", ranges, repeats)
// into the order field — both stay in sync. Tiles are keyed by occurrence so a
// number can appear multiple times. Adapters (page-grid, file-grid) supply how
// items are rendered, labelled, committed (output), and opened (lightbox).

import { reorder } from '@atlaskit/pragmatic-drag-and-drop/reorder';
import {
  byId,
  makeTile,
  monitorReorder,
  onDuplicate,
  onOpen,
  onRemove,
  swapInto,
  tileCanvas,
  wireTile,
} from './dnd';

const THUMB_KEY = 'ream-thumb-size';

export interface GridIds {
  fileId: string;
  orderId: string;
  thumbsId: string;
  sizeId: string;
  statusId: string;
}

interface GridConfig {
  ids: GridIds;
  readyText?: string;
  // Load the selection (stashing the source for `render`); return the item count
  // 1..N, or 0 to skip thumbnails (e.g. too many pages) and let the user type.
  load(files: FileList): Promise<number>;
  // Render item `number` to a fresh canvas natively at `displayWidth` CSS px.
  render(number: number, displayWidth: number): Promise<HTMLCanvasElement>;
  // Tile label for item `number` shown at 1-based `position`.
  label(number: number, position: number): string;
  // Extra output sync after every change (e.g. rewrite the file input).
  commit(order: number[]): void;
  // Open the lightbox for the clicked occurrence.
  open(number: number, order: number[], position: number): void;
}

interface Grid {
  container: HTMLElement;
  order: HTMLInputElement;
  file: HTMLInputElement;
  occ: string[]; // occurrence ids, in order
  occNum: Map<string, number>; // occurrence id -> item number
  tiles: Map<string, HTMLElement>;
  max: number;
  counter: number;
  thumbW: number; // current display width of a tile
  config: GridConfig;
}

const identity = (count: number): number[] =>
  Array.from({ length: count }, (_, index) => index + 1);

function expandRange(from: number, to: number): number[] {
  const step = from <= to ? 1 : -1;
  const out: number[] = [];
  for (let value = from; step > 0 ? value <= to : value >= to; value += step)
    out.push(value);
  return out;
}

function expandToken(token: string): number[] | undefined {
  const range = /^(\d+)-(\d+)$/.exec(token);
  if (range) return expandRange(Number(range[1]), Number(range[2]));
  return /^\d+$/.test(token) ? [Number(token)] : undefined;
}

function inRange(values: number[], max: number): boolean {
  return (
    values.length > 0 && values.every((value) => value >= 1 && value <= max)
  );
}

function parse(value: string, max: number): number[] | undefined {
  const out: number[] = [];
  const tokens = value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  for (const token of tokens) {
    const expanded = expandToken(token);
    if (!expanded) return undefined;
    out.push(...expanded);
  }
  return inRange(out, max) ? out : undefined;
}

function sequence(grid: Grid): number[] {
  return grid.occ.map((id) => grid.occNum.get(id) ?? 0);
}

function renumber(grid: Grid): void {
  let position = 1;
  for (const id of grid.occ) {
    const number = grid.occNum.get(id);
    const label = grid.tiles.get(id)?.querySelector('.tile-label');
    if (label && number !== undefined)
      label.textContent = grid.config.label(number, position);
    position += 1;
  }
}

function place(grid: Grid): void {
  for (const id of grid.occ) {
    const tile = grid.tiles.get(id);
    if (tile) grid.container.append(tile);
  }
  renumber(grid);
}

function commit(grid: Grid): void {
  place(grid);
  grid.order.value = sequence(grid).join(',');
  grid.config.commit(sequence(grid));
}

function removeOcc(grid: Grid, id: string): void {
  grid.tiles.get(id)?.remove();
  grid.tiles.delete(id);
  grid.occNum.delete(id);
  grid.occ = grid.occ.filter((other) => other !== id);
  if (grid.occ.length === 0) grid.file.value = '';
  commit(grid);
}

// Render the item and swap it into the tile when ready. A per-tile generation
// tag discards a stale render (the tile was removed, replaced, or re-rendered at
// a new size) so out-of-order async completions never paint the wrong thumbnail.
function paint(grid: Grid, id: string, number: number): void {
  const tile = grid.tiles.get(id);
  if (!tile) return;
  const gen = String(Number(tile.dataset.gen ?? '0') + 1);
  tile.dataset.gen = gen;
  grid.config.render(number, grid.thumbW).then(
    (rendered) => {
      if (grid.tiles.get(id) === tile && tile.dataset.gen === gen) {
        swapInto(tileCanvas(tile), rendered);
      }
    },
    () => {
      /* render cancelled — tile removed/replaced or source destroyed */
    },
  );
}

function makeOcc(grid: Grid, number: number): string {
  grid.counter += 1;
  const id = `o${grid.counter}`;
  const tile = makeTile(id, '');
  grid.occNum.set(id, number);
  grid.tiles.set(id, tile);
  wireTile(tile, id);
  onRemove(tile, () => removeOcc(grid, id));
  onDuplicate(tile, () => duplicateOcc(grid, id));
  onOpen(tile, () =>
    grid.config.open(number, sequence(grid), grid.occ.indexOf(id)),
  );
  paint(grid, id, number);
  return id;
}

function duplicateOcc(grid: Grid, id: string): void {
  const number = grid.occNum.get(id);
  if (number === undefined) return;
  const copy = makeOcc(grid, number);
  grid.occ.splice(grid.occ.indexOf(id) + 1, 0, copy);
  commit(grid);
}

function move(grid: Grid, fromId: string, toId: string): void {
  if (fromId === toId) return;
  const startIndex = grid.occ.indexOf(fromId);
  const finishIndex = grid.occ.indexOf(toId);
  if (startIndex === -1 || finishIndex === -1) return;
  grid.occ = reorder({ list: grid.occ, startIndex, finishIndex });
  commit(grid);
}

// Rebuild the grid from a typed sequence. We don't rewrite the order field (so
// the user's text, including ranges, is preserved) but still sync the output.
function applyTyped(grid: Grid): void {
  const numbers = parse(grid.order.value, grid.max);
  if (!numbers) return;
  for (const tile of grid.tiles.values()) tile.remove();
  grid.tiles.clear();
  grid.occNum.clear();
  grid.occ = numbers.map((number) => makeOcc(grid, number));
  place(grid);
  grid.config.commit(sequence(grid));
}

// Re-render every tile natively at the current size (from the cached source).
function repaint(grid: Grid): void {
  for (const id of grid.occ) {
    const number = grid.occNum.get(id);
    if (number !== undefined) paint(grid, id, number);
  }
}

// Bind the size slider. While dragging we only update the CSS width (cheap, so
// it resizes live); the proper re-render at the new size runs once on release
// (`change`), rAF-throttled so repeated events coalesce to one repaint per frame.
function wireSize(grid: Grid, slider: HTMLInputElement): void {
  let raf = 0;
  const setWidth = () => {
    grid.thumbW = Number(slider.value);
    grid.container.style.setProperty('--thumb-w', `${slider.value}px`);
  };
  const resample = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      repaint(grid);
    });
  };
  const saved = globalThis.localStorage?.getItem(THUMB_KEY);
  if (saved) slider.value = saved;
  setWidth();
  slider.addEventListener('input', setWidth);
  slider.addEventListener('change', () => {
    globalThis.localStorage?.setItem(THUMB_KEY, slider.value);
    resample();
  });
}

function reset(grid: Grid): void {
  grid.container.replaceChildren();
  grid.tiles.clear();
  grid.occNum.clear();
  grid.occ = [];
  grid.counter = 0;
}

async function load(grid: Grid, files: FileList): Promise<void> {
  reset(grid);
  grid.max = await grid.config.load(files);
  if (grid.max === 0) {
    grid.order.value = '';
    grid.container.hidden = true;
    return;
  }
  grid.container.hidden = false;
  grid.occ = identity(grid.max).map((number) => makeOcc(grid, number));
  commit(grid);
}

export function setupGrid(config: GridConfig): void {
  const grid: Grid = {
    container: byId<HTMLElement>(config.ids.thumbsId),
    order: byId<HTMLInputElement>(config.ids.orderId),
    file: byId<HTMLInputElement>(config.ids.fileId),
    occ: [],
    occNum: new Map(),
    tiles: new Map(),
    max: 0,
    counter: 0,
    thumbW: 120,
    config,
  };
  const status = byId<HTMLElement>(config.ids.statusId);

  monitorReorder((from, to) => move(grid, from, to));
  wireSize(grid, byId<HTMLInputElement>(config.ids.sizeId));
  grid.order.addEventListener('input', () => applyTyped(grid));

  grid.file.addEventListener('change', () => {
    const { files } = grid.file;
    if (!files || files.length === 0) return;
    status.textContent = 'Reading…';
    load(grid, files)
      .then(() => (status.textContent = config.readyText ?? ''))
      .catch(
        (error: unknown) =>
          (status.textContent = String((error as Error).message || error)),
      );
  });
}
