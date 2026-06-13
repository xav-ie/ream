// PDF → images page — a single-PDF page grid (reorder/extract which pages to
// render) posting to /api/pdf-to-images.

import { setupPageGrid } from './page-grid';

setupPageGrid({
  fileId: 'pdf2img-file',
  orderId: 'pdf2img-order',
  thumbsId: 'pdf2img-thumbs',
  sizeId: 'pdf2img-size',
  statusId: 'pdf2img-status',
});
