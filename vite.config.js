import { readFileSync, statSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { mobileGeodata } from './tools/mobile-geodata.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const threeCDN = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@2bd920c3a604a3b847d9187b0a1c21e33807ecb3';
let development = false;
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
    name: 'city-scripts',
    configResolved(config) {
      development = config.command === 'serve';
    },
    configureServer(server) {
      server.middlewares.use('/js/kazan-geodata-lite.json.gz', (request, response) => {
        const payload = getMobilePayload();
        response.setHeader('Content-Type', 'application/gzip');
        response.setHeader('Content-Length', payload.length);
        response.end(payload);
      });
    },
    transformIndexHtml(html, context) {
      if (context.filename !== `${root}index.html`) return html;
      if (!development) {
        const version = createHash('sha256').update(html);
        for (const path of new Set([...html.matchAll(/'\.\/(js\/[a-z-]+\.js)'/g)].map((match) => match[1]))) {
          version.update(readFileSync(new URL(path, import.meta.url)));
        }
        version.update(readFileSync(new URL('js/kazan-geodata.json.gz', import.meta.url)));
        version.update(readFileSync(new URL('tools/mobile-geodata.mjs', import.meta.url)));
        return html.replace(/const assetVersion = '[^']+';/, `const assetVersion = '${version.digest('hex').slice(0, 16)}';`);
      }
      const transformed = html.replace(/const assetVersion = '[^']+';/, 'const assetVersion = String(Date.now());')
        .replace(/(href="\.\/css\/style\.css)\?v=[^"]+/, '$1');
      return process.env.KAZAN_SOFTWARE_PREVIEW === '1' ? transformed.replace('<head>', '<head><script>document.documentElement.dataset.softwarePreview = "true";</script>') : transformed;
    },
    handleHotUpdate(context) {
      if (context.file.startsWith(`${root}js/`)) {
        context.server.ws.send({ type: 'full-reload' });
        return [];
      }
    },
    generateBundle() {
      const html = readFileSync(new URL('index.html', import.meta.url), 'utf8');
      for (const path of new Set([...html.matchAll(/'\.\/(js\/[a-z-]+\.js)'/g)].map((m) => m[1]))) {
        this.emitFile({ type: 'asset', fileName: path, source: readFileSync(new URL(path, import.meta.url), 'utf8') });
      }
      this.emitFile({ type: 'asset', fileName: 'js/kazan-geodata.json.gz', source: readFileSync(new URL('js/kazan-geodata.json.gz', import.meta.url)) });
      this.emitFile({ type: 'asset', fileName: 'js/kazan-geodata-lite.json.gz', source: getMobilePayload() });
    }
  }]
});
