// Shared building blocks for the drag-to-reorder thumbnail grids used by the
// reorder (pages of one PDF) and merge (multiple PDFs) pages. Tiles carry a
// string `id`; a monitor reports drops as (fromId, toId) for the page to apply.

import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import {
  draggable,
  dropTargetForElements,
  monitorForElements,
} from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { disableNativeDragPreview } from '@atlaskit/pragmatic-drag-and-drop/element/disable-native-drag-preview';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

// Device pixel ratio (capped) — thumbnails render at displayWidth × dpr so they
// are pixel-exact: pdf.js / the image is rasterised natively at the shown size
// rather than downscaled from a larger bitmap (sharper, and far less memory).
const dpr = (): number => Math.min(globalThis.devicePixelRatio || 1, 2);

function targetWidth(displayWidth: number): number {
  return Math.max(1, Math.round(displayWidth * dpr()));
}

export function byId<T extends HTMLElement>(id: string): T {
  return document.querySelector<T>(`#${id}`) as T;
}

export function makeTile(id: string, label: string): HTMLElement {
  const tile = document.createElement('div');
  tile.className = 'tile';
  tile.dataset.id = id;
  const canvas = document.createElement('canvas');
  const span = document.createElement('span');
  span.className = 'tile-label';
  span.textContent = label;
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'tile-remove';
  remove.textContent = '✕';
  remove.setAttribute('aria-label', 'Remove');
  tile.append(canvas, span, remove);
  return tile;
}

// Wire the tile's × button. pointerdown is swallowed so it doesn't start a drag.
export function onRemove(tile: HTMLElement, handler: () => void): void {
  const button = tile.querySelector('.tile-remove');
  if (!button) return;
  button.addEventListener('pointerdown', (event) => event.stopPropagation());
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    handler();
  });
}

// Add a ⊕ button (bottom-right) that duplicates the tile in place.
export function onDuplicate(tile: HTMLElement, handler: () => void): void {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'tile-dup';
  button.textContent = '⧉';
  button.setAttribute('aria-label', 'Duplicate');
  button.addEventListener('pointerdown', (event) => event.stopPropagation());
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    handler();
  });
  tile.append(button);
}

// Open the tile (lightbox) on click. The ✕/⧉ buttons stop propagation, and a
// drag never produces a click, so this only fires on a plain tile click.
export function onOpen(tile: HTMLElement, handler: () => void): void {
  tile.addEventListener('click', handler);
}

export function tileCanvas(tile: HTMLElement): HTMLCanvasElement {
  return tile.querySelector('canvas') as HTMLCanvasElement;
}

// cloneNode does not copy a canvas bitmap, so repaint it for the drag preview.
function copyCanvas(from: HTMLElement, to: HTMLElement): void {
  const source = from.querySelector('canvas');
  const target = to.querySelector('canvas');
  if (!source || !target) return;
  target.width = source.width;
  target.height = source.height;
  target.getContext('2d')?.drawImage(source, 0, 0);
}

// Build a drag-preview clone sized to match the thumbnail's *displayed* size.
// The cloned canvas's intrinsic bitmap is larger than its display size; without
// pinning its CSS size it rasterises huge and the preview sprawls off-cursor.
function buildPreview(tile: HTMLElement): HTMLElement {
  const preview = tile.cloneNode(true) as HTMLElement;
  copyCanvas(tile, preview);
  preview.classList.add('drag-preview');
  preview.classList.remove('dragging', 'over');
  for (const button of preview.querySelectorAll('.tile-remove, .tile-dup'))
    button.remove();
  preview.style.width = `${tile.offsetWidth}px`;
  const source = tile.querySelector('canvas');
  const clone = preview.querySelector('canvas');
  if (source && clone) {
    clone.style.width = `${source.clientWidth}px`;
    clone.style.height = `${source.clientHeight}px`;
  }
  return preview;
}

interface Point {
  clientX: number;
  clientY: number;
}

// Position the follower so the grab point stays under the cursor. This browser
// ignores setDragImage's offset entirely (the native ghost pins ~at the cursor
// regardless of where you grabbed), so we drive our own element instead.
function place(
  follower: HTMLElement,
  input: Point,
  grabX: number,
  grabY: number,
): void {
  follower.style.left = `${input.clientX - grabX}px`;
  follower.style.top = `${input.clientY - grabY}px`;
}

export function wireTile(tile: HTMLElement, id: string): void {
  let follower: HTMLElement | undefined;
  let grabX = 0;
  let grabY = 0;
  combine(
    draggable({
      element: tile,
      getInitialData: () => ({ id }),
      onGenerateDragPreview: ({ nativeSetDragImage, location, source }) => {
        // Hide the native ghost; we render and position our own preview.
        disableNativeDragPreview({ nativeSetDragImage });
        const rect = source.element.getBoundingClientRect();
        grabX = location.current.input.clientX - rect.left;
        grabY = location.current.input.clientY - rect.top;
      },
      onDragStart: ({ location }) => {
        tile.classList.add('dragging');
        follower = buildPreview(tile);
        follower.style.position = 'fixed';
        follower.style.margin = '0';
        follower.style.zIndex = '9999';
        follower.style.pointerEvents = 'none';
        document.body.append(follower);
        place(follower, location.current.input, grabX, grabY);
      },
      onDrag: ({ location }) => {
        if (follower) place(follower, location.current.input, grabX, grabY);
      },
      onDrop: () => {
        tile.classList.remove('dragging');
        follower?.remove();
        follower = undefined;
      },
    }),
    dropTargetForElements({
      element: tile,
      getData: () => ({ id }),
      onDragEnter: () => tile.classList.add('over'),
      onDragLeave: () => tile.classList.remove('over'),
      onDrop: () => tile.classList.remove('over'),
    }),
  );
}

export function monitorReorder(
  onMove: (fromId: string, toId: string) => void,
): void {
  monitorForElements({
    onDrop({ source, location }) {
      const target = location.current.dropTargets[0];
      if (target) onMove(String(source.data.id), String(target.data.id));
    },
  });
}

// Copy a freshly-rendered (offscreen) canvas into a visible one in a single
// step — the visible canvas keeps its old content until the new one is ready,
// so there's no blank/white flash mid-render. The caller decides whether to
// apply, which lets it discard a stale render (see grid-core/lightbox).
export function swapInto(
  target: HTMLCanvasElement,
  source: HTMLCanvasElement,
): void {
  target.width = source.width;
  target.height = source.height;
  target.getContext('2d')?.drawImage(source, 0, 0);
}

// Render a page into a fresh offscreen canvas (never the live one) so callers
// can choose whether to swap the result in.
async function renderAtScale(
  page: pdfjs.PDFPageProxy,
  scale: number,
): Promise<HTMLCanvasElement> {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const context = canvas.getContext('2d');
  if (context)
    await page.render({ canvas, canvasContext: context, viewport }).promise;
  return canvas;
}

// Render a page natively at displayWidth × dpr.
export async function renderPage(
  page: pdfjs.PDFPageProxy,
  displayWidth: number,
): Promise<HTMLCanvasElement> {
  return renderAtScale(
    page,
    targetWidth(displayWidth) / page.getViewport({ scale: 1 }).width,
  );
}

export async function loadPdf(file: File): Promise<pdfjs.PDFDocumentProxy> {
  return pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
}

export type Pdf = pdfjs.PDFDocumentProxy;

// Render a page scaled to fit within maxWidth × maxHeight (for the lightbox).
export async function renderPageFit(
  page: pdfjs.PDFPageProxy,
  maxWidth: number,
  maxHeight: number,
): Promise<HTMLCanvasElement> {
  const base = page.getViewport({ scale: 1 });
  return renderAtScale(
    page,
    Math.min(maxWidth / base.width, maxHeight / base.height),
  );
}

// Draw an image file into a fresh canvas natively at displayWidth × dpr.
export function renderImage(
  file: File,
  displayWidth: number,
): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.addEventListener('load', () => {
      const width = targetWidth(displayWidth);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = Math.max(
        1,
        Math.round((width * image.naturalHeight) / image.naturalWidth),
      );
      canvas
        .getContext('2d')
        ?.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas);
    });
    image.addEventListener('error', () => {
      URL.revokeObjectURL(url);
      reject(new Error(`could not load ${file.name}`));
    });
    image.src = url;
  });
}
