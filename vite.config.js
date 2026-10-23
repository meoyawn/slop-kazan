import { readFileSync, statSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { mobileGeodata } from './tools/mobile-geodata.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const threeCDN = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@2bd920c3a604a3b847d9187b0a1c21e33807ecb3';
let mobilePayload = null;
let mobileSourceTime = 0;

function getMobilePayload() {
  const file = new URL('js/kazan-geodata.json.gz', import.meta.url);
  const modified = statSync(file).mtimeMs;
  if (!mobilePayload || modified !== mobileSourceTime) {
    mobilePayload = gzipSync(JSON.stringify(mobileGeodata(JSON.parse(gunzipSync(readFileSync(file))))), { level: 9 });
    mobileSourceTime = modified;
  }
  return mobilePayload;
}

export default defineConfig({
  base: './',
  define: {
    __KAZAN_GEODATA_VERSION__: JSON.stringify(createHash('sha256')
      .update(readFileSync(new URL('js/kazan-geodata.json.gz', import.meta.url)))
      .update(readFileSync(new URL('tools/mobile-geodata.mjs', import.meta.url))).digest('hex').slice(0, 16))
  },
  server: { host: '127.0.0.1', port: 5173, strictPort: true, watch: { ignored: ['**/tools/data/**'] } },
  optimizeDeps: { noDiscovery: true },
  resolve: { alias: [
    { find: /^three\/webgpu$/, replacement: `${threeCDN}/build/three.webgpu.js` },
    { find: /^three\/tsl$/, replacement: `${threeCDN}/build/three.tsl.js` },
    { find: /^three\/addons\//, replacement: `${threeCDN}/examples/jsm/` },
    { find: /^three$/, replacement: `${threeCDN}/build/three.webgpu.js` }
  ] },
  build: { rollupOptions: { external: /^three(?:\/|$)/ } },
  plugins: [{
    name: 'kazan-geography',
    configureServer(server) {
      server.middlewares.use('/js/kazan-geodata-lite.json.gz', (request, response) => {
        const payload = getMobilePayload();
        response.setHeader('Content-Type', 'application/gzip');
        response.setHeader('Content-Length', payload.length);
        response.end(payload);
      });
    },
    transformIndexHtml: {
      order: 'post',
      handler(html, context) {
        if (context.filename !== `${root}index.html`) return html;
        const cityChunk = context.bundle && Object.values(context.bundle).find((chunk) => chunk.type === 'chunk' && chunk.facadeModuleId === `${root}js/main.js`);
        const preload = cityChunk ? `./${cityChunk.fileName}` : './js/main.js';
        const transformed = html.replace(/(href="\.\/css\/style\.css)\?v=[^"]+/, '$1')
          .replace('<script type="module"', `<link rel="modulepreload" href="${preload}" />\n  <script type="module"`);
        return process.env.KAZAN_SOFTWARE_PREVIEW === '1' ? transformed.replace('<head>', '<head><script>document.documentElement.dataset.softwarePreview = "true";</script>') : transformed;
      }
    },
    handleHotUpdate(context) {
      if (context.file.startsWith(`${root}js/`)) {
        context.server.ws.send({ type: 'full-reload' });
        return [];
      }
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'js/kazan-geodata.json.gz', source: readFileSync(new URL('js/kazan-geodata.json.gz', import.meta.url)) });
      this.emitFile({ type: 'asset', fileName: 'js/kazan-geodata-lite.json.gz', source: getMobilePayload() });
    }
  }]
});
