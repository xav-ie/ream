// Wires every <form data-api> on the page: submit -> upload files in chunks ->
// POST the operation -> show the result with Save, Preview and the tools it can
// continue into (see result.ts). Saving waits for the Save click, so the native
// "Save As" dialog always opens inside a user gesture.

import { takeChained } from './chain';
import { hideResult, showResult, wireResult } from './result';

interface SavePickerOptions {
  suggestedName?: string;
}
interface FileSystemWritable {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
}
interface SaveHandle {
  createWritable(): Promise<FileSystemWritable>;
}
type ShowSaveFilePicker = (options?: SavePickerOptions) => Promise<SaveHandle>;

function picker(): ShowSaveFilePicker | undefined {
  return (globalThis as unknown as { showSaveFilePicker?: ShowSaveFilePicker })
    .showSaveFilePicker;
}

function statusSetter(form: HTMLFormElement) {
  const status = form.querySelector<HTMLElement>('.actions .status');
  return (message: string, kind: '' | 'ok' | 'err' = '') => {
    if (status) {
      status.className = `status ${kind}`.trim();
      status.textContent = message;
    }
  };
}

function setBusy(button: HTMLButtonElement | null, busy: boolean): void {
  if (button) button.disabled = busy;
}

function errorMessage(error: unknown): string {
  return String((error as Error).message || error);
}

function anchorDownload(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = Object.assign(document.createElement('a'), {
    href: url,
    download: name,
  });
  anchor.click();
  URL.revokeObjectURL(url);
}

// Cloudflare caps a request body at 100 MB, so each file goes up first in
// pieces under that and the operation names it as "<upload id>/<filename>".
const CHUNK = 64 * 1024 * 1024;
const ATTEMPTS = 3;

async function putChunk(url: string, body: Blob, attempt = 1): Promise<void> {
  try {
    const response = await fetch(url, { method: 'PUT', body });
    if (!response.ok) throw new Error(await response.text());
  } catch (error) {
    if (attempt >= ATTEMPTS) throw error;
    await putChunk(url, body, attempt + 1);
  }
}

async function upload(
  file: File,
  progress: (sent: number) => void,
): Promise<string> {
  const id = crypto.randomUUID().replaceAll('-', '');
  let offset = 0;
  do {
    const piece = file.slice(offset, offset + CHUNK);
    await putChunk(`/api/upload/${id}?offset=${offset}`, piece);
    offset += piece.size;
    progress(piece.size);
  } while (offset < file.size);
  return `${id}/${file.name}`;
}

// An empty <input type="file"> still submits a nameless, empty File; skip it.
const isUpload = (value: FormDataEntryValue): value is File =>
  value instanceof File && value.name !== '';

const uploadSize = (fields: [string, FormDataEntryValue][]): number =>
  fields.reduce((sum, [, v]) => sum + (isUpload(v) ? v.size : 0), 0);

async function uploadFields(
  form: HTMLFormElement,
  setStatus: (message: string) => void,
): Promise<FormData> {
  const fields = [...new FormData(form)];
  const total = Math.max(1, uploadSize(fields));
  let sent = 0;
  const progress = (bytes: number) => {
    sent += bytes;
    setStatus(`Uploading… ${Math.round((100 * sent) / total)}%`);
  };
  const body = new FormData();
  for (const [key, value] of fields) {
    if (isUpload(value)) body.append(key, await upload(value, progress));
    else if (typeof value === 'string') body.append(key, value);
  }
  return body;
}

async function runOperation(
  api: string,
  form: HTMLFormElement,
  setStatus: (message: string) => void,
): Promise<Blob> {
  const body = await uploadFields(form, setStatus);
  setStatus('Working…');
  const response = await fetch(api, { method: 'POST', body });
  if (!response.ok)
    throw new Error((await response.text()) || response.statusText);
  return response.blob();
}

async function save(file: File): Promise<void> {
  const show = picker();
  if (!show) {
    anchorDownload(file, file.name);
    return;
  }
  try {
    const handle = await show({ suggestedName: file.name });
    const writable = await handle.createWritable();
    await writable.write(file);
    await writable.close();
  } catch (error) {
    if ((error as DOMException).name !== 'AbortError') throw error;
  }
}

async function handleSubmit(form: HTMLFormElement): Promise<void> {
  const api = form.dataset.api;
  if (!api) return;
  const setStatus = statusSetter(form);
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  hideResult(form);
  setStatus('Working…');
  setBusy(button, true);
  try {
    const result = await runOperation(api, form, setStatus);
    setStatus('Done.', 'ok');
    showResult(form, result, form.dataset.filename || 'result');
  } catch (error) {
    setStatus(errorMessage(error), 'err');
  } finally {
    setBusy(button, false);
  }
}

for (const form of document.querySelectorAll<HTMLFormElement>(
  'form[data-api]',
)) {
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void handleSubmit(form);
  });
  wireResult(form, save);
  // After every module script, so the page's grid is listening for the file.
  document.addEventListener('DOMContentLoaded', () => void takeChained(form));
}
