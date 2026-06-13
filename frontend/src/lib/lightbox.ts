// A shared fullscreen lightbox for a closer look at grid tiles. It navigates a
// set with ‹ › / arrow keys: either a gallery of images (one File each) or the
// pages of a single PDF. A title (filename) shows top-left; a counter bottom.
// One lazily-built instance is reused. Close on backdrop click or Escape.

import { loadPdf, renderPageFit, swapInto, type Pdf } from './dnd';

interface Lightbox {
  root: HTMLElement;
  stage: HTMLElement;
  canvas: HTMLCanvasElement;
  image: HTMLImageElement;
  title: HTMLElement;
  counter: HTMLElement;
  previous: HTMLButtonElement;
  next: HTMLButtonElement;
  mode: 'image' | 'pdf';
  images: File[];
  index: number; // image index (0-based)
  pdf?: Pdf;
  page: number; // pdf page (1-based)
  name: string;
  url?: string;
}

let box: Lightbox | undefined;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

function total(lb: Lightbox): number {
  return lb.mode === 'image' ? lb.images.length : (lb.pdf?.numPages ?? 1);
}

function position(lb: Lightbox): number {
  return lb.mode === 'image' ? lb.index + 1 : lb.page;
}

function button(
  className: string,
  label: string,
  text: string,
): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = className;
  element.setAttribute('aria-label', label);
  element.textContent = text;
  return element;
}

function onKey(event: KeyboardEvent): void {
  switch (event.key) {
    case 'Escape': {
      close();
      break;
    }
    case 'ArrowLeft': {
      step(-1);
      break;
    }
    case 'ArrowRight': {
      step(1);
      break;
    }
    // no default
  }
}

function build(): Lightbox {
  const root = document.createElement('div');
  root.className = 'lightbox';
  root.hidden = true;
  const stage = document.createElement('div');
  stage.className = 'lightbox-stage';
  const canvas = document.createElement('canvas');
  const image = document.createElement('img');
  image.alt = 'preview';
  stage.append(canvas, image);
  const title = document.createElement('div');
  title.className = 'lightbox-title';
  const counter = document.createElement('div');
  counter.className = 'lightbox-counter';
  const close_ = button('lightbox-close', 'Close', '✕');
  const previous = button('lightbox-nav lightbox-previous', 'Previous', '‹');
  const next = button('lightbox-nav lightbox-next', 'Next', '›');
  root.append(title, close_, previous, stage, next, counter);
  document.body.append(root);

  root.addEventListener('click', (event) => {
    if (event.target === root) close();
  });
  close_.addEventListener('click', close);
  previous.addEventListener('click', () => step(-1));
  next.addEventListener('click', () => step(1));
  return {
    root,
    stage,
    canvas,
    image,
    title,
    counter,
    previous,
    next,
    mode: 'pdf',
    images: [],
    index: 0,
    page: 1,
    name: '',
  };
}

function ensure(): Lightbox {
  box ??= build();
  return box;
}

function showImage(lb: Lightbox): void {
  if (lb.url) URL.revokeObjectURL(lb.url);
  const file = lb.images[lb.index];
  lb.url = URL.createObjectURL(file);
  lb.image.src = lb.url;
  lb.name = file.name;
}

function stageSize(): { width: number; height: number } {
  // Supersample (>= 2x): render larger than the display so CSS scales it down
  // crisply, accounting for high-DPI screens.
  const factor = Math.max(globalThis.devicePixelRatio || 1, 2);
  return {
    width: globalThis.innerWidth * 0.92 * factor,
    height: globalThis.innerHeight * 0.92 * factor,
  };
}

async function paintPage(lb: Lightbox, pdf: Pdf, want: number): Promise<void> {
  const { width, height } = stageSize();
  const page = await pdf.getPage(want);
  const rendered = await renderPageFit(page, width, height);
  // Discard if navigation/close moved on while this was rendering.
  if (lb.mode === 'pdf' && lb.page === want) swapInto(lb.canvas, rendered);
}

async function showPage(lb: Lightbox): Promise<void> {
  if (!lb.pdf) return;
  await paintPage(lb, lb.pdf, lb.page).catch(() => {
    /* render superseded or document gone */
  });
}

async function showCurrent(lb: Lightbox): Promise<void> {
  if (lb.mode === 'image') showImage(lb);
  else await showPage(lb);
  lb.title.textContent =
    total(lb) > 1 ? `${position(lb)}. ${lb.name}` : lb.name;
  lb.counter.textContent = `${position(lb)} / ${total(lb)}`;
  lb.previous.disabled = position(lb) <= 1;
  lb.next.disabled = position(lb) >= total(lb);
}

function step(delta: number): void {
  if (!box) return;
  const max = total(box);
  if (box.mode === 'image') box.index = clamp(box.index + delta, 0, max - 1);
  else box.page = clamp(box.page + delta, 1, max);
  void showCurrent(box);
}

function open(lb: Lightbox): void {
  const isPdf = lb.mode === 'pdf';
  lb.canvas.hidden = !isPdf;
  lb.image.hidden = isPdf;
  const many = total(lb) > 1;
  lb.previous.hidden = !many;
  lb.next.hidden = !many;
  lb.counter.hidden = !many;
  lb.root.hidden = false;
  document.addEventListener('keydown', onKey);
  void showCurrent(lb);
}

function close(): void {
  if (!box) return;
  box.root.hidden = true;
  if (box.url) {
    URL.revokeObjectURL(box.url);
    box.url = undefined;
  }
  box.pdf = undefined;
  box.images = [];
  document.removeEventListener('keydown', onKey);
}

export function openImages(files: File[], start: number): void {
  const lb = ensure();
  lb.mode = 'image';
  lb.images = files;
  lb.index = start;
  lb.pdf = undefined;
  open(lb);
}

export function openPdf(pdf: Pdf, startPage: number, name: string): void {
  const lb = ensure();
  lb.mode = 'pdf';
  lb.pdf = pdf;
  lb.page = startPage;
  lb.name = name;
  open(lb);
}

export async function openPdfFromFile(file: File): Promise<void> {
  openPdf(await loadPdf(file), 1, file.name);
}
