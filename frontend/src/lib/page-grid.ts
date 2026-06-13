// Single-PDF page grid (reorder, pdf→images): items are the pages of one PDF,
// numbered by page. The order field is posted to the backend as name="order".
// PDFs with >= MAX_PREVIEW_PAGES pages skip thumbnails and let the user type.

import { loadPdf, renderPage, type Pdf } from './dnd';
import { setupGrid, type GridIds } from './grid-core';
import { openPdf } from './lightbox';

const MAX_PREVIEW_PAGES = 100;

export function setupPageGrid(ids: GridIds): void {
  let pdf: Pdf | undefined;
  let name = '';
  setupGrid({
    ids,
    async load(files) {
      pdf?.cleanup(); // release the previous document's rendered-page/font memory
      const file = files[0];
      pdf = await loadPdf(file);
      name = file.name;
      return pdf.numPages >= MAX_PREVIEW_PAGES ? 0 : pdf.numPages;
    },
    async render(number, width) {
      if (!pdf) return document.createElement('canvas');
      return renderPage(await pdf.getPage(number), width);
    },
    label: String,
    commit: () => {
      // The order field itself is the output; nothing extra to sync.
    },
    open: (number) => {
      if (pdf) openPdf(pdf, number, name);
    },
  });
}
