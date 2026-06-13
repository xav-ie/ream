// Merge page: a reorderable grid of the selected PDFs (first-page thumbnail
// each). Dragging sets the order they are combined in.

import { loadPdf, renderPage, type Pdf } from './dnd';
import { setupFileGrid } from './file-grid';

// Cache loaded PDFs so re-rendering on resize doesn't re-parse each file.
const pdfs = new Map<File, Pdf>();

async function renderFirstPage(
  file: File,
  width: number,
): Promise<HTMLCanvasElement> {
  let pdf = pdfs.get(file);
  if (!pdf) {
    pdf = await loadPdf(file);
    pdfs.set(file, pdf);
  }
  return renderPage(await pdf.getPage(1), width);
}

function resetPdfs(): void {
  for (const pdf of pdfs.values()) pdf.cleanup();
  pdfs.clear();
}

setupFileGrid({
  ids: {
    fileId: 'merge-files',
    orderId: 'merge-order',
    thumbsId: 'merge-thumbs',
    sizeId: 'merge-size',
    statusId: 'merge-status',
  },
  readyText: 'Drag to set merge order.',
  render: renderFirstPage,
  preview: 'pdf',
  reset: resetPdfs,
});
