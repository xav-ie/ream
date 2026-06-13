// Multi-file grid (merge, images→pdf): items are the selected files, numbered
// first-come (1..N). The order field is a UI mirror (typing reorders/duplicates
// by number); the actual output is the file input's FileList, rewritten on every
// change so the form posts the files in order (and repeats duplicates).

import { byId } from './dnd';
import { setupGrid, type GridIds } from './grid-core';
import { openImages, openPdfFromFile } from './lightbox';

type TileRenderer = (file: File, width: number) => Promise<HTMLCanvasElement>;

export interface FileGridOptions {
  ids: GridIds;
  readyText: string;
  render: TileRenderer;
  preview: 'image' | 'pdf';
  // Called before each new selection, to release any cached resources.
  reset?: () => void;
}

function gallery(files: Map<number, File>, order: number[]): File[] {
  const out: File[] = [];
  for (const number of order) {
    const file = files.get(number);
    if (file) out.push(file);
  }
  return out;
}

export function setupFileGrid(options: FileGridOptions): void {
  const input = byId<HTMLInputElement>(options.ids.fileId);
  const files = new Map<number, File>();

  setupGrid({
    ids: options.ids,
    readyText: options.readyText,
    async load(selected) {
      options.reset?.();
      files.clear();
      let number = 0;
      for (const file of selected) {
        number += 1;
        files.set(number, file);
      }
      return number;
    },
    async render(number, width) {
      const file = files.get(number);
      return file
        ? options.render(file, width)
        : document.createElement('canvas');
    },
    label: (number) => `${number}. ${files.get(number)?.name ?? ''}`,
    commit: (order) => {
      const data = new DataTransfer();
      for (const number of order) {
        const file = files.get(number);
        if (file) data.items.add(file);
      }
      input.files = data.files;
    },
    open: (number, order, position) => {
      if (options.preview === 'pdf') {
        const file = files.get(number);
        if (file) void openPdfFromFile(file);
        return;
      }
      openImages(gallery(files, order), position);
    },
  });
}
