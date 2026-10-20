// The result panel under each tool, ezgif-style: the output's name and size,
// Save, Preview (PDFs), and the tools it can continue into. The current result
// lives per form, so the buttons are wired once and always act on the latest.

import { offerChain } from './chain';
import { openPdfFromFile } from './lightbox';

const current = new WeakMap<HTMLFormElement, File>();

function size(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function part<T extends HTMLElement>(form: HTMLFormElement, name: string) {
  return form.querySelector<T>(`.result-${name}`);
}

export function wireResult(
  form: HTMLFormElement,
  save: (file: File) => Promise<void>,
): void {
  part(form, 'save')?.addEventListener('click', () => {
    const file = current.get(form);
    if (file) void save(file);
  });
  part(form, 'preview')?.addEventListener('click', () => {
    const file = current.get(form);
    if (file) void openPdfFromFile(file);
  });
}

function show(element: HTMLElement | null, visible: boolean): void {
  if (element) element.hidden = !visible;
}

export function hideResult(form: HTMLFormElement): void {
  show(part(form, 'panel'), false);
}

export function showResult(
  form: HTMLFormElement,
  blob: Blob,
  name: string,
): void {
  const pdf = name.endsWith('.pdf');
  const file = new File([blob], name, {
    type: pdf ? 'application/pdf' : blob.type,
  });
  current.set(form, file);
  const label = part(form, 'name');
  if (label) label.textContent = `${name} · ${size(file.size)}`;
  show(part(form, 'preview'), pdf);
  offerChain(form, file);
  show(part(form, 'panel'), true);
}
