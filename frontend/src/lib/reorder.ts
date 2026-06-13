// Reorder / extract page — a single-PDF page grid posting to /api/reorder.

import { setupPageGrid } from './page-grid';

setupPageGrid({
  fileId: 'reorder-file',
  orderId: 'reorder-order',
  thumbsId: 'reorder-thumbs',
  sizeId: 'reorder-size',
  statusId: 'reorder-status',
});
