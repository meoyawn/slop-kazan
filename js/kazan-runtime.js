import { GEO_DATA_FILE, GEO_DATA_VERSION } from './kazan-geodata.js';

export const runtime = {
  software: typeof document !== 'undefined' && document.documentElement?.dataset?.softwarePreview === 'true'
};
export const loading = {
  progress: 0,
  failed: false,
  update(progress, message) {
    if (this.failed) return;
    this.progress = Math.max(this.progress, Math.min(100, Math.round(progress)));
    const track = document.getElementById('loading-track');
    const fill = document.getElementById('loading-progress');
    const percent = document.getElementById('loading-percent');
    const status = document.getElementById('loading-status');
    if (track) track.setAttribute('aria-valuenow', String(this.progress));
    if (fill) fill.style.transform = `scaleX(${this.progress / 100})`;
    if (percent) percent.textContent = `${this.progress}%`;
    if (status && message) status.textContent = message;
  },
  fail(error) {
    if (this.failed) return;
    this.failed = true;
    console.error('[startup]', error);
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.classList.remove('hidden');
    const status = document.getElementById('loading-status');
    if (status) status.textContent = 'Could not start the game. Please retry.';
    const retry = document.getElementById('loading-retry');
    if (retry) retry.hidden = false;
  }
};
if (typeof addEventListener === 'function') addEventListener('error', (event) => {
  if (!document.getElementById('loading-overlay')?.classList.contains('hidden')) loading.fail(event.error || event.message);
});
if (typeof addEventListener === 'function') addEventListener('unhandledrejection', (event) => {
  if (!document.getElementById('loading-overlay')?.classList.contains('hidden')) loading.fail(event.reason);
});
export const services = {};
export let GEO;

/** Install the same mapped source in the browser and the offline geometry compiler. */
export function installGeography(geography) {
  if (geography.city?.name !== 'Kazan') throw new Error('Expected Kazan geography');
  GEO = geography;
}

export async function loadGeography() {
  const dataURL = new URL(`js/${GEO_DATA_FILE}`, document.baseURI);
  dataURL.searchParams.set('v', GEO_DATA_VERSION);
  const abort = new AbortController();
  let idle = setTimeout(() => abort.abort(), 60000);
  try {
    const response = await fetch(dataURL, { signal: abort.signal });
    if (!response.ok) throw new Error(`Could not load Kazan geography: ${response.status}`);
    const decoded = Boolean(response.headers.get('Content-Encoding'));
    const total = decoded ? 0 : Number(response.headers.get('Content-Length'));
    let received = 0;
    const reader = response.body.getReader();
    let first = await reader.read();
    while (!first.done && first.value.length < 2) {
      const next = await reader.read();
      if (next.done) break;
      const header = new Uint8Array(first.value.length + next.value.length);
      header.set(first.value); header.set(next.value, first.value.length);
      first = { value: header, done: false };
    }
    function report(chunk) {
      received += chunk.byteLength;
      clearTimeout(idle);
      idle = setTimeout(() => abort.abort(), 60000);
      const size = `${(received / 1048576).toFixed(1)} MB${total ? ` / ${(total / 1048576).toFixed(1)} MB` : decoded ? ' decoded' : ''}`;
      loading.update(10 + (total ? Math.min(1, received / total) * 30 : 0), `${decoded ? 'Reading' : 'Downloading'} Kazan · ${size}`);
    }
    const stream = new ReadableStream({
      start(controller) {
        if (!first.done) { report(first.value); controller.enqueue(first.value); }
        else controller.close();
      },
      async pull(controller) {
        const chunk = await reader.read();
        if (chunk.done) { clearTimeout(idle); controller.close(); }
        else { report(chunk.value); controller.enqueue(chunk.value); }
      },
      cancel(reason) { return reader.cancel(reason); }
    });
    const compressed = first.value?.[0] === 31 && first.value?.[1] === 139;
    const geography = await new Response(compressed ? stream.pipeThrough(new DecompressionStream('gzip')) : stream).json();
    installGeography(geography);
  } finally { clearTimeout(idle); }
  loading.update(42, 'Preparing Kazan…');
}
