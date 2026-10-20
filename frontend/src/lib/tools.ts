// Single source of truth for the tool catalogue. The home grid renders from
// this list; each tool also has its own page. Icons live in components/icon.astro,
// keyed by slug.
export interface Tool {
  slug: string;
  title: string;
  blurb: string;
  // What the tool's file input takes; a PDF result chains to 'pdf' tools.
  input: 'pdf' | 'images' | 'office';
  // What it returns.
  output: 'pdf' | 'zip';
}

export const tools: readonly Tool[] = [
  {
    slug: 'compress',
    title: 'Compress',
    blurb: 'Shrink file size.',
    input: 'pdf',
    output: 'pdf',
  },
  {
    slug: 'images-to-pdf',
    title: 'Images → PDF',
    blurb: 'One image per page.',
    input: 'images',
    output: 'pdf',
  },
  {
    slug: 'merge',
    title: 'Merge',
    blurb: 'Combine several PDFs into one.',
    input: 'pdf',
    output: 'pdf',
  },
  {
    slug: 'office-to-pdf',
    title: 'Office → PDF',
    blurb: 'Word, Excel, ODF, and more.',
    input: 'office',
    output: 'pdf',
  },
  {
    slug: 'pdf-to-images',
    title: 'PDF → Images',
    blurb: 'A PNG per page, as a zip.',
    input: 'pdf',
    output: 'zip',
  },
  {
    slug: 'reorder',
    title: 'Reorder / extract',
    blurb: 'Pick a page sequence or range.',
    input: 'pdf',
    output: 'pdf',
  },
  {
    slug: 'split',
    title: 'Split',
    blurb: 'One PDF per page, as a zip.',
    input: 'pdf',
    output: 'zip',
  },
];
