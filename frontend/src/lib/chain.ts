// Chaining: a PDF result can go straight into the next tool, like ezgif's
// "use this result" row. The file rides in IndexedDB across the page load
// (results can be far bigger than sessionStorage allows); the next tool's page
// drops it into its file input, whose change event loads any thumbnail grid.

import { tools } from './tools';

const STORE = 'chain';
const KEY = 'pending';
const PARAM = 'chained';

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('ream', 1);
    request.addEventListener('upgradeneeded', () =>
      request.result.createObjectStore(STORE),
    );
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => reject(request.error));
  });
}

async function inStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const connection = await database();
  return new Promise((resolve, reject) => {
    const request = run(connection.transaction(STORE, mode).objectStore(STORE));
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => reject(request.error));
  });
}

function chainLink(slug: string, title: string, file: File): HTMLAnchorElement {
  const link = Object.assign(document.createElement('a'), {
    className: 'chip',
    href: `/${slug}?${PARAM}`,
    textContent: title,
  });
  link.addEventListener('click', (event) => {
    event.preventDefault();
    void inStore('readwrite', (store) => store.put(file, KEY)).then(() =>
      globalThis.location.assign(link.href),
    );
  });
  return link;
}

/** Offers every PDF tool for a PDF result; hides the row for anything else. */
export function offerChain(form: HTMLFormElement, blob: Blob, name: string) {
  const nav = form.querySelector<HTMLElement>('.chain');
  if (!nav) return;
  nav.hidden = !name.endsWith('.pdf');
  if (nav.hidden) return;
  const file = new File([blob], name, { type: 'application/pdf' });
  const here = globalThis.location.pathname.replaceAll('/', '');
  const links = tools
    .filter((tool) => tool.input === 'pdf' && tool.slug !== here)
    .map((tool) => chainLink(tool.slug, tool.title, file));
  nav.replaceChildren('Continue with', ...links);
}

/** On a page opened from a chain link, loads the handed-over file. */
export async function takeChained(form: HTMLFormElement): Promise<void> {
  if (!new URLSearchParams(globalThis.location.search).has(PARAM)) return;
  const file = await inStore<File | undefined>('readonly', (store) =>
    store.get(KEY),
  );
  await inStore('readwrite', (store) => store.delete(KEY));
  globalThis.history.replaceState(
    globalThis.history.state,
    '',
    globalThis.location.pathname,
  );
  const input = form.querySelector<HTMLInputElement>('input[type="file"]');
  if (!file || !input) return;
  const data = new DataTransfer();
  data.items.add(file);
  input.files = data.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}
