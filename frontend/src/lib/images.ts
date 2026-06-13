// Images → PDF page: a reorderable grid of the selected images. Dragging sets
// the order they become pages in the output PDF.

import { renderImage } from './dnd';
import { setupFileGrid } from './file-grid';

setupFileGrid({
  ids: {
    fileId: 'images-files',
    orderId: 'images-order',
    thumbsId: 'images-thumbs',
    sizeId: 'images-size',
    statusId: 'images-status',
  },
  readyText: 'Drag to set page order.',
  render: renderImage,
  preview: 'image',
});
