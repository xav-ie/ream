// Single source of truth for the tool catalogue. The home grid renders from
// this list; each tool also has its own page. Icons live in components/icon.astro,
// keyed by slug.
export interface Tool {
  slug: string;
  title: string;
  blurb: string;
}

export const tools: readonly Tool[] = [
  { slug: 'compress', title: 'Compress', blurb: 'Shrink file size.' },
  {
    slug: 'images-to-pdf',
    title: 'Images → PDF',
    blurb: 'One image per page.',
  },
  { slug: 'merge', title: 'Merge', blurb: 'Combine several PDFs into one.' },
  {
    slug: 'office-to-pdf',
    title: 'Office → PDF',
    blurb: 'Word, Excel, ODF, and more.',
  },
  {
    slug: 'pdf-to-images',
    title: 'PDF → Images',
    blurb: 'A PNG per page, as a zip.',
  },
  {
    slug: 'reorder',
    title: 'Reorder / extract',
    blurb: 'Pick a page sequence or range.',
  },
  { slug: 'split', title: 'Split', blurb: 'One PDF per page, as a zip.' },
];
